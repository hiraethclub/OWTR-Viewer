# Ofcom Spectrum Map

A standalone Windows desktop application built with Electron that visualises Ofcom Wireless Telegraphy Register (WTR) data on an interactive map.

## Features

- Load Ofcom WTR CSV files via file picker
- Filter by frequency range (MHz) and licensee name
- Interactive map with Leaflet and CartoDB tiles
- Scrollable results table with click-to-pan
- Dark theme UI

## Getting Started

```bash
npm install
npm start
```

## Building for Windows

```bash
npm run build
```

This produces a Windows NSIS installer in the `dist/` folder.

## CSV Format

The app expects the standard Ofcom WTR CSV format with columns including:
- `Frequency (Hz)`
- `Licencee Company`
- `Licencee Surname`
- `Licencee First Name`
- `Latitude(Deg)`
- `Longitude(Deg)`
- `Product Description`

## License

MIT
