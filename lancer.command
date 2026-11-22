#!/bin/bash
cd "$(dirname "$0")"
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
(sleep 1; open -a Safari http://localhost:8802/) &
python3 -m http.server 8802
