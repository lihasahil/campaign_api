import { app } from "./app";
import { config } from "../config";

async function main() {
  app.listen(config.port, () =>
    console.log(`SMS gateway listening on http://localhost:${config.port}`),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
