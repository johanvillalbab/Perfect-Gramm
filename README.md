# Perfect Gramm

Corrector gramatical para Chrome. Español e inglés. Sin cuentas, sin configuración, sin ruido.

## Qué hace

Revisa lo que escribís en cualquier campo de texto de cualquier sitio web. Detecta errores de ortografía, gramática y estilo, y te sugiere correcciones con un clic.

- Un punto verde aparece junto al campo: todo bien.
- Un punto rojo: hay errores. Hacé clic para verlos.

Eso es todo.

## Qué no hace

- No guarda tu texto.
- No necesita cuenta ni API key.
- No muestra banners, upgrades ni distracciones.

## Stack

```
Chrome Extension (Manifest V3)
├── content.js    → detecta campos editables, muestra badge y tooltip
├── background.js → service worker, comunica con la API
├── popup.html    → interfaz CLI para config y pruebas rápidas
└── LanguageTool API (pública, gratuita)
```

## Idiomas

| Código  | Idioma      |
|---------|-------------|
| `es`    | Español     |
| `en-US` | English US  |

Se selecciona desde el popup. Por defecto: español.

## Cómo se ve

El popup simula una terminal. Fondo negro, tipografía monoespaciada, sin decoración innecesaria.

El badge en vivo es un círculo de 12px que aparece discretamente en la esquina del campo de texto activo. Verde si no hay errores, rojo si los hay, gris pulsante mientras revisa.

El tooltip de correcciones sigue la misma estética: fondo oscuro, sugerencias con prefijo `+`, texto erróneo con prefijo `-`, navegación con `< prev` / `next >`.

## Instalar

1. Cloná el repo:

```bash
git clone https://github.com/johanvillalbab/Perfect-Gramm.git
```

2. Abrí `chrome://extensions` en Chrome.
3. Activá **Modo desarrollador**.
4. Clic en **Cargar extensión sin empaquetar**.
5. Seleccioná la carpeta `Perfect-Gramm`.

## Estructura

```
Perfect-Gramm/
├── manifest.json
├── background.js
├── content.js
├── content.css
├── popup.html
├── popup.css
├── popup.js
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## Licencia

MIT
