# Transport Hub

Transport Hub is an Angular web app for exploring Carris Metropolitana stops, live vehicles, and upcoming departures in the Lisbon metropolitan area.

## Features

- Explore stops on an interactive map or in a searchable list.
- Search by stop, locality, municipality, parish, or line.
- Cluster stop markers as you zoom out.
- Show or hide stop and bus layers independently.
- View buses as line-colored markers with a direction arrow. Bus markers are hidden below zoom level 15 and cluster when they are visible.
- Select a stop to see upcoming departures, including estimated and scheduled times.
- Sort the list by distance from the map center or your current location.
- Center the map on your current location (requires browser location permission).

## Data and map

Transit data is loaded from the public [Carris Metropolitana API](https://api.carrismetropolitana.pt/v2) and the [CP stations and timetable API](https://api-gateway.cp.pt/cp/services/travel-api/stations). The map uses [Leaflet](https://leafletjs.com/) with tiles from [OpenStreetMap](https://www.openstreetmap.org/).

The app needs an internet connection to load transit data and map tiles. Location access is optional.

The CP API credentials are used by the local Node proxy and are never bundled into the browser app. Copy `.env.example` to `.env` and set `X_CP_CONNECT_ID` and `X_CP_CONNECT_SECRET` before running `npm start`. The `.env` file is ignored by Git. The production static app also needs a server-side proxy for `/api/cp/stations`; configure that route to run `server/cp-proxy.cjs` with the same environment variables. Do not expose the credentials in frontend configuration.

## Operator services

Operators are registered in `src/app/operator-config.ts`. Each entry specifies an operator ID, name, stop-marker background and foreground colors, and service class. Services implement the `OperatorService` contract in `src/app/interfaces/operator-service.interface.ts`; the app uses the configured services to load and merge stops, lines, vehicles, and arrivals. Line styles are scoped by operator to avoid ID collisions and fall back to that operator's configured colors when no line-specific style is available. Stops shared by multiple operators combine their configured background colors.

To add an operator, implement `OperatorService` and add it to `OPERATOR_CONFIGS` with a unique ID, name, and stop-marker background and foreground colors.

## Getting started

Install dependencies and start the development server:

```bash
npm install
npm start
```

Open [http://localhost:4200](http://localhost:4200). The root URL redirects to `/map`; `/list` opens the stop list. A stop can be deep-linked with `/map/:stopId`.

## Available commands

| Command | Description |
| --- | --- |
| `npm start` | Start the development server |
| `npm run build` | Create a production build in `dist/` |
| `npm test` | Run unit tests with Vitest |
| `npm run watch` | Build in development mode and rebuild on changes |
