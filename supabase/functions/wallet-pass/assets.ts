/**
 * Placeholder pass artwork. Apple rejects a .pkpass without icon.png, so these
 * solid-navy PNGs keep passes valid out of the box — swap in real hotel
 * branding by replacing these base64 strings (or setting HOTEL_LOGO_URL).
 */
export const ICON_29 =
  'iVBORw0KGgoAAAANSUhEUgAAAB0AAAAdCAIAAADZ8fBYAAAAJklEQVR42mMQ0vSmBWIYNXfU3FFzR80dNXfU3FFzR80dNXdQmQsA/F64RjUrHlMAAAAASUVORK5CYII=';

export const ICON_58 =
  'iVBORw0KGgoAAAANSUhEUgAAADoAAAA6CAIAAABu2d1/AAAARklEQVR42u3OAQkAAAgDsGewhVns38cch8ECLLNXJLq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6PR6SSuEzh0Bj3QAAAABJRU5ErkJggg==';

export const LOGO_160 =
  'iVBORw0KGgoAAAANSUhEUgAAAKAAAAAyCAIAAABUA0cyAAAAaUlEQVR42u3RQQ0AAAjEsNOAC7Tg3w8q+JAmU7CmevS4WABYgAVYgAVYgAUYsAALsAALsAALMGABFmABFmABFmABBizAAizAAizAAgxYgAVYgAVYgAUYsAALsAALsAALsAADFmABFmDdtW+yXHGjIturAAAAAElFTkSuQmCC';

export const base64ToBytes = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
