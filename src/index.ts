import dotenv from "dotenv";
import Vorpal from "vorpal";
import { Account, CoinbasePro } from "coinbase-pro-node";
import BigNumber from "bignumber.js";
import table from "./table";
import type { Question } from "inquirer";

dotenv.config();
const { API_KEY, API_SECRET, API_PASSPHRASE } = process.env;

const cli = new Vorpal();

const cbp = new CoinbasePro({
  apiKey: String(API_KEY),
  apiSecret: String(API_SECRET),
  passphrase: String(API_PASSPHRASE),
  useSandbox: false,
});

const accounts: Record<string, Account> = {};

async function fetchAccounts() {
  const a = await cbp.rest.account.listAccounts();
  a.forEach((o) => (accounts[o.currency] = o));
}

async function fetchFills(currency: string) {
  const output = [];
  const limit = 100;
  let result,
    after,
    hasMore = true;
  while (hasMore) {
    result = await cbp.rest.fill.getFillsByProductId(
      `${currency}-USD`,
      after ? { after, limit } : { limit }
    );
    output.push(...result.data);
    hasMore = result.data.length === limit;
    after = result.pagination.after;
    cli.log(`Fetched ${output.length} fills${hasMore ? "..." : "."}`);
  }
  return output;
}

cli
  .command("balance", "List your positive balance accounts")
  .alias("list")
  .action(async function (this: Vorpal.CommandInstance) {
    this.log(
      table(
        Object.values(accounts).filter((a) =>
          new BigNumber(a.balance).gt(0.01)
        ),
        "currency",
        "balance"
      )
    );
  });

cli
  .command("ask", "Prompt with a list")
  .action(async function (this: Vorpal.CommandInstance) {
    const result = await this.prompt({
      name: "coin",
      type: "list",
      message: "Which coin?",
      choices: Object.keys(accounts),
    } as Question);
    cli.exec(result.coin);
  });

cli
  .catch("<coin>", "Compute averages")
  .action(async function (this: Vorpal.CommandInstance, { coin }) {
    const account = accounts[coin.toUpperCase()];
    if(!account || account.currency === "USD") {
      this.log(`${account.currency} is not a traded coin!`);
      return;
    }

    this.log(table([account], "id", "hold", "available"));

    const fills = await fetchFills(account.currency);
    if (fills.length === 0) {
      throw new Error("No fills found!");
    }
    this.log(
      table(
        fills,
        "created_at",
        "trade_id",
        "side",
        "price",
        "size",
        "fee",
        "usd_volume"
      )
    );
  });

fetchAccounts().then(() => {
  cli.log(`😎 ${Object.keys(accounts).length} accounts`);
  const [a, b, ...c] = process.argv;
  if (c.length) {
    cli
      .delimiter("")
      .show()
      .exec(c.join(" "))
      .then(() => process.exit());
  } else {
    cli.delimiter("cbp$").show();
  }
});
