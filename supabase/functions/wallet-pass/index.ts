/**
 * GroupStay wallet pass service.
 *
 * GET /wallet-pass?platform=apple&serial=…&token=…&hotel=…&guest=…&room=…
 *   → a signed .pkpass the iPhone adds straight to Apple Wallet
 * GET /wallet-pass?platform=google&…
 *   → a 302 to pay.google.com/gp/v/save/<jwt> for Google Wallet
 *
 * Deploy:  supabase functions deploy wallet-pass --no-verify-jwt
 * See README.md in this folder for the certificates each platform needs.
 */
import forge from 'npm:node-forge@1.3.1';
import JSZip from 'npm:jszip@3.10.1';
import { SignJWT, importPKCS8 } from 'npm:jose@5.9.6';
import { ICON_29, ICON_58, LOGO_160, base64ToBytes } from './assets.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
};

type PassContext = {
  serial: string;
  token: string;
  hotel: string;
  guest: string;
  room: string;
  confirmation: string;
  checkIn: string;
  checkOut: string;
};

const env = (name: string) => Deno.env.get(name) ?? '';

const readContext = (url: URL): PassContext => ({
  serial: url.searchParams.get('serial') ?? '',
  token: url.searchParams.get('token') ?? '',
  hotel: url.searchParams.get('hotel') ?? 'Hotel',
  guest: url.searchParams.get('guest') ?? 'Guest',
  room: url.searchParams.get('room') ?? '—',
  confirmation: url.searchParams.get('confirmation') ?? '—',
  checkIn: url.searchParams.get('checkIn') ?? '',
  checkOut: url.searchParams.get('checkOut') ?? '',
});

const humanDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

// ---------------------------------------------------------------------------
// Apple Wallet
// ---------------------------------------------------------------------------

function buildPassJson(ctx: PassContext) {
  const expiry = ctx.checkOut ? `${ctx.checkOut.split('T')[0]}T12:00:00Z` : undefined;
  return {
    formatVersion: 1,
    passTypeIdentifier: env('APPLE_PASS_TYPE_ID'),
    teamIdentifier: env('APPLE_TEAM_ID'),
    organizationName: ctx.hotel,
    serialNumber: ctx.serial,
    description: `${ctx.hotel} room key`,
    foregroundColor: 'rgb(255, 255, 255)',
    backgroundColor: 'rgb(18, 41, 75)',
    labelColor: 'rgb(160, 180, 210)',
    logoText: ctx.hotel,
    ...(expiry ? { expirationDate: expiry } : {}),
    // A boarding-pass-shaped layout reads as a travel document in Wallet.
    generic: {
      headerFields: [{ key: 'room', label: 'ROOM', value: ctx.room }],
      primaryFields: [{ key: 'guest', label: 'GUEST', value: ctx.guest }],
      secondaryFields: [
        { key: 'checkin', label: 'CHECK-IN', value: humanDate(ctx.checkIn) },
        { key: 'checkout', label: 'CHECK-OUT', value: humanDate(ctx.checkOut), textAlignment: 'PKTextAlignmentRight' },
      ],
      auxiliaryFields: [{ key: 'confirmation', label: 'CONFIRMATION', value: ctx.confirmation }],
      backFields: [
        { key: 'howto', label: 'How to use', value: 'Hold your phone near the door reader, or show the QR code at the front desk.' },
        { key: 'serial', label: 'Key serial', value: ctx.serial },
        { key: 'support', label: 'Need help?', value: `Contact the ${ctx.hotel} front desk.` },
      ],
    },
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: JSON.stringify({
          v: 1,
          typ: 'groupstay.roomkey',
          tok: ctx.token,
          sn: ctx.serial,
          room: ctx.room,
          exp: expiry ?? '',
        }),
        messageEncoding: 'iso-8859-1',
        altText: `Room ${ctx.room}`,
      },
    ],
    // NFC needs an Apple-provisioned NFC-enabled Pass Type ID + a key pair.
    ...(env('APPLE_NFC_PUBLIC_KEY')
      ? { nfc: { message: ctx.token, encryptionPublicKey: env('APPLE_NFC_PUBLIC_KEY') } }
      : {}),
  };
}

/** PKCS#7 detached signature over manifest.json, exactly as Apple requires. */
function signManifest(manifest: string): Uint8Array {
  const p12Der = forge.util.decode64(env('APPLE_PASS_CERT_P12_BASE64'));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, env('APPLE_PASS_CERT_PASSWORD'));

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  if (certBags.length === 0 || keyBags.length === 0) {
    throw new Error('Could not read the signing certificate or private key from the .p12');
  }

  const certificate = certBags[0].cert!;
  const privateKey = keyBags[0].key!;
  const wwdr = forge.pki.certificateFromPem(env('APPLE_WWDR_CERT_PEM'));

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest, 'utf8');
  p7.addCertificate(certificate);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key: privateKey,
    certificate,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  });
  p7.sign({ detached: true });

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return Uint8Array.from(der, (c) => c.charCodeAt(0));
}

async function buildPkpass(ctx: PassContext): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {
    'pass.json': new TextEncoder().encode(JSON.stringify(buildPassJson(ctx))),
    'icon.png': base64ToBytes(ICON_29),
    'icon@2x.png': base64ToBytes(ICON_58),
    'logo.png': base64ToBytes(LOGO_160),
  };

  // Optional: pull real hotel branding instead of the placeholder logo.
  const logoUrl = env('HOTEL_LOGO_URL');
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl);
      if (res.ok) files['logo.png'] = new Uint8Array(await res.arrayBuffer());
    } catch {
      // Keep the placeholder if the logo can't be fetched.
    }
  }

  // manifest.json maps every file to its SHA-1 — Apple verifies each one.
  const manifest: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(files)) {
    const md = forge.md.sha1.create();
    md.update(forge.util.binary.raw.encode(bytes));
    manifest[name] = md.digest().toHex();
  }
  const manifestJson = JSON.stringify(manifest);

  const zip = new JSZip();
  for (const [name, bytes] of Object.entries(files)) zip.file(name, bytes);
  zip.file('manifest.json', manifestJson);
  zip.file('signature', signManifest(manifestJson));

  return await zip.generateAsync({ type: 'uint8array' });
}

// ---------------------------------------------------------------------------
// Google Wallet
// ---------------------------------------------------------------------------

async function buildGoogleSaveUrl(ctx: PassContext): Promise<string> {
  const issuerId = env('GOOGLE_WALLET_ISSUER_ID');
  const classId = `${issuerId}.groupstay_roomkey`;
  const serviceAccountEmail = env('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKeyPem = env('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n');

  const genericObject = {
    id: `${issuerId}.${ctx.serial.replace(/[^\w.-]/g, '_')}`,
    classId,
    state: 'ACTIVE',
    hexBackgroundColor: '#12294b',
    cardTitle: { defaultValue: { language: 'en-US', value: ctx.hotel } },
    header: { defaultValue: { language: 'en-US', value: `Room ${ctx.room}` } },
    subheader: { defaultValue: { language: 'en-US', value: 'Digital Room Key' } },
    textModulesData: [
      { id: 'guest', header: 'Guest', body: ctx.guest },
      { id: 'checkin', header: 'Check-in', body: humanDate(ctx.checkIn) },
      { id: 'checkout', header: 'Check-out', body: humanDate(ctx.checkOut) },
      { id: 'confirmation', header: 'Confirmation', body: ctx.confirmation },
    ],
    barcode: {
      type: 'QR_CODE',
      value: JSON.stringify({ v: 1, typ: 'groupstay.roomkey', tok: ctx.token, sn: ctx.serial, room: ctx.room }),
      alternateText: `Room ${ctx.room}`,
    },
    validTimeInterval: ctx.checkOut
      ? { end: { date: `${ctx.checkOut.split('T')[0]}T12:00:00Z` } }
      : undefined,
  };

  const key = await importPKCS8(privateKeyPem, 'RS256');
  const jwt = await new SignJWT({
    iss: serviceAccountEmail,
    aud: 'google',
    typ: 'savetowallet',
    payload: { genericObjects: [genericObject] },
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .sign(key);

  return `https://pay.google.com/gp/v/save/${jwt}`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const platform = url.searchParams.get('platform') ?? 'apple';
  const ctx = readContext(url);

  const appleReady = !!(env('APPLE_PASS_CERT_P12_BASE64') && env('APPLE_PASS_TYPE_ID') && env('APPLE_TEAM_ID') && env('APPLE_WWDR_CERT_PEM'));
  const googleReady = !!(env('GOOGLE_WALLET_ISSUER_ID') && env('GOOGLE_SERVICE_ACCOUNT_EMAIL') && env('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'));
  const ready = platform === 'google' ? googleReady : appleReady;

  // The app probes with HEAD before opening the link.
  if (req.method === 'HEAD') {
    return new Response(null, { status: ready ? 200 : 403, headers: cors });
  }

  if (!ctx.serial || !ctx.token) {
    return new Response('Missing serial or token', { status: 400, headers: cors });
  }

  if (!ready) {
    return new Response(
      JSON.stringify({
        error: 'not_configured',
        message:
          platform === 'google'
            ? 'Set GOOGLE_WALLET_ISSUER_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.'
            : 'Set APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT_P12_BASE64, APPLE_PASS_CERT_PASSWORD and APPLE_WWDR_CERT_PEM.',
      }),
      { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  try {
    if (platform === 'google') {
      const saveUrl = await buildGoogleSaveUrl(ctx);
      return new Response(null, { status: 302, headers: { ...cors, Location: saveUrl } });
    }

    const pkpass = await buildPkpass(ctx);
    return new Response(pkpass, {
      headers: {
        ...cors,
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${ctx.serial}.pkpass"`,
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'pass_generation_failed', message: String(error) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
