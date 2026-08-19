# Wallet pass service

Generates the Apple Wallet `.pkpass` and Google Wallet save link for a guest's
digital room key. This has to run on a server — both platforms require signing
with private keys that must never ship inside the mobile app.

Until you deploy this function, the app's wallet buttons show a friendly
"pass server not deployed yet" message. Everything else (the in-app key card,
the QR credential, expiry, revoke) works without it.

## Deploy

```bash
supabase functions deploy wallet-pass --no-verify-jwt
```

## Apple Wallet setup

You need an Apple Developer account ($99/yr).

1. In the Apple Developer portal → Identifiers → **Pass Type IDs**, create one
   (e.g. `pass.com.yourhotel.groupstay`).
2. Create a certificate for it, download the `.cer`, open it in Keychain
   Access, and export the certificate **with its private key** as a `.p12`.
3. Download Apple's **WWDR G4** intermediate certificate and convert it to PEM:
   ```bash
   openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem
   ```
4. Base64 the `.p12`:
   ```bash
   base64 -i Certificates.p12 | tr -d '\n' > p12.txt
   ```
5. Set the secrets:
   ```bash
   supabase secrets set APPLE_PASS_TYPE_ID="pass.com.yourhotel.groupstay"
   supabase secrets set APPLE_TEAM_ID="YOURTEAMID"
   supabase secrets set APPLE_PASS_CERT_P12_BASE64="$(cat p12.txt)"
   supabase secrets set APPLE_PASS_CERT_PASSWORD="the-p12-password"
   supabase secrets set APPLE_WWDR_CERT_PEM="$(cat wwdr.pem)"
   ```

### NFC unlocking

Tap-to-unlock from the Wallet pass needs an **NFC-enabled Pass Type ID**, which
Apple grants only to approved partners (hotel lock vendors like Assa Abloy,
Salto, and Dormakaba go through this process). Once approved, set
`APPLE_NFC_PUBLIC_KEY` and the function adds the `nfc` dictionary to the pass.
Without it, the QR code is the credential — which every front desk scanner and
most QR-capable locks accept.

## Google Wallet setup

1. Create a Google Wallet API issuer account in the
   [Google Pay & Wallet Console](https://pay.google.com/business/console).
2. Create a Google Cloud service account, give it Wallet Object Issuer access,
   and download its JSON key.
3. Create a Generic pass class with id `<ISSUER_ID>.groupstay_roomkey`.
4. Set the secrets:
   ```bash
   supabase secrets set GOOGLE_WALLET_ISSUER_ID="3388000000012345678"
   supabase secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL="wallet@project.iam.gserviceaccount.com"
   supabase secrets set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
   ```

## Optional branding

```bash
supabase secrets set HOTEL_LOGO_URL="https://…/logo.png"   # 160x50 recommended
```

Otherwise the placeholder artwork in `assets.ts` is used — replace those base64
strings with real branding for production.

## Keeping passes up to date

The pass embeds the key token and stay dates at the moment it was added. When a
guest changes rooms or extends their stay, the app re-issues the pass link, and
`digital_keys.valid_until` moves with the reservation, so a stale pass stops
working at the old checkout time.

For true silent push updates (the pass changing in Wallet without the guest
re-adding it), implement Apple's
[pass registration web service](https://developer.apple.com/documentation/walletpasses/adding_a_web_service_to_update_passes)
endpoints — `webServiceURL` and `authenticationToken` in `pass.json` — and call
the Google Wallet REST API to patch the object. Both hang off this same
function; the data model already tracks everything they need
(`pass_serial`, `wallet_added_at`, `valid_until`).
