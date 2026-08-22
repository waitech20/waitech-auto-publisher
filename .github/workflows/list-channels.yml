name: WaiTech List Buffer Channels

on:
  workflow_dispatch: {}

jobs:
  list-channels:
    runs-on: ubuntu-latest
    timeout-minutes: 3

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: List channels
        env:
          BUFFER_ACCESS_TOKEN: ${{ secrets.BUFFER_ACCESS_TOKEN }}
        run: node src/list-channels.js

      - name: Introspect Instagram/Pinterest schema
        env:
          BUFFER_ACCESS_TOKEN: ${{ secrets.BUFFER_ACCESS_TOKEN }}
        run: node src/introspect-schema.js
