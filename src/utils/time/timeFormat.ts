let appTimeFormat: '12h' | '24h' = '12h';

export function setAppTimeFormat(format: '12h' | '24h') {
  appTimeFormat = format;
}

export function getAppTimeFormat(): '12h' | '24h' {
  return appTimeFormat;
}

