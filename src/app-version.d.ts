declare module 'virtual:app-version' {
  export const appVersion: {
    readonly version: string;
    readonly build: string;
    readonly label: string;
  };
}
