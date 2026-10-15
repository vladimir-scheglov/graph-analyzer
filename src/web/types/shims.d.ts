// ============ URL-импорты (esm.sh) ============
// TypeScript не умеет резолвить https://... в import() без явной декларации.
// Добавляем wildcard для всех https-модулей.
declare module "https://*" {
  const mod: any;
  export default mod;
  export const marked: any;
  export const parse: any;
  export function useMarked(): any;
}
