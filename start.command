#!/bin/bash
cd "$(dirname "$0")"
open http://localhost:3000
python3 -m http.server 3000
