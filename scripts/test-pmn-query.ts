// Standalone runner to exercise getAllCombinedFieldData() against the database.
// Loads .env first so DATABASE_URL is set before the Prisma client is created.
import "dotenv/config";
import { getAllCombinedFieldData } from "../src/pmn/pmn.queries";

getAllCombinedFieldData()
  .then((rows) => {
    console.log(`Fetched ${rows.length} row(s):`);
    console.log(rows);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
