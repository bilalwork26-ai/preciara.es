# Marca Preciara

Recursos de marca en SVG, listos para usar fuera de la aplicación (redes,
prensa, favicon de terceros). Dentro del sitio, el logotipo se renderiza
como componente React (`src/components/icons/Logo.tsx`) para heredar la
tipografía Fraunces real; estos ficheros son la versión portátil.

- `mark.svg` — símbolo aislado (gema facetada), para favicon, avatar o
  espacios reducidos.
- `logo-horizontal.svg` — símbolo + "Preciara", para cabeceras, documentos
  o firmas donde no se pueda usar el componente React. El texto usa una
  pila de fuentes serif del sistema (no Fraunces, que requiere carga web).

Colores de marca: azul marino `#101d33` / `#16273f`, azul cristal
`#6e9cc4`, teal `#0f6b64`, coral `#e97e63`, marfil `#faf6ee`.
