// A file's text as the bundler gives it (Vite's `?raw`): the app's tsconfig leaves vite/client out, so this one form is declared here.
declare module "*?raw" {
  const text: string;
  export default text;
}
