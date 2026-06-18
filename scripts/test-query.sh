#!/usr/bin/env bash
# Run the pmn_combined_field_data query and print the result.
set -euo pipefail

# Move to the project root regardless of where the script is invoked from.
cd "$(dirname "$0")/.."

npx ts-node scripts/test-pmn-query.ts
