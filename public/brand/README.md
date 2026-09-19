# Marca Preciara

Recursos de marca en SVG, listos para usar fuera de la aplicación (redes,
prensa, favicon de terceros). Dentro del sitio, el logotipo se renderiza
como componente React (`src/components/icons/Logo.tsx`) para heredar la
tipografía Fraunces real y adaptar el color del símbolo según el fondo
(`theme="dark"` sobre fondos claros, `theme="light"` sobre la cabecera
navy); estos ficheros son la versión portátil, fija sobre fondo claro.

- `preciara-mark.svg` — símbolo aislado (P formada por dos flechas
  enfrentadas: comparación de precios), para favicon, avatar o espacios
  reducidos.
- `preciara-logo-horizontal.svg` — símbolo + "Preciara", para cabeceras,
  documentos o firmas donde no se pueda usar el componente React. El
  texto usa una pila de fuentes serif del sistema (no Fraunces, que
  requiere carga web).

Colores de marca: azul marino `#071A33`, azul cristal `#19A7CE`, teal
`#087F78`, coral `#F06449`, marfil `#F7F2E8`.
