import dotenv from "dotenv";
import Vorpal from "vorpal";
import { Account, CoinbasePro } from "coinbase-pro-node";
import Table from "tty-table";
import BigNumber from "bignumber.js";

dotenv.config();
const { API_KEY, API_SECRET, API_PASSPHRASE } = process.env;
const cli = new Vorpal();
const cbp = new CoinbasePro({
  apiKey: String(API_KEY),
  apiSecret: String(API_SECRET),
  passphrase: String(API_PASSPHRASE),
  useSandbox: false,
});

function printTable<T>(a: T[], ...keys: Array<keyof T>) {
  const ks = keys.length ? keys.map(String) : Object.keys(a[0]);
  cli.log(
    Table(
      ks.map<Table.Header>((k) => ({
        value: k,
        width: "auto",
        align: "right",
        headerAlign: "right",
        formatter(o) {
          if (k.endsWith("_at")) {
            return new Date(o).toLocaleString();
          }
          if (k.endsWith("_id")) {
            return o;
          }
          return isNaN(o) ? o : new BigNumber(o).toFixed(8);
        },
      })),
      a
    ).render()
  );
}

type Cache = {
  accounts: Account[];
};

const cache: Cache = {
  accounts: [],
};

async function fetchAccounts() {
  cache.accounts = await cbp.rest.account.listAccounts();
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
    cli.log(`Fetched ${output.length} fills`);
  }
  return output;
}

cli
  .command("list", "List your accounts")
  .alias("show")
  .action(async function () {
    printTable(
      cache.accounts.filter((a) => new BigNumber(a.balance).gt(0.01)),
      "currency",
      "balance"
    );
  });

cli.catch("<coin>", "Compute averages").action(async function (this: Vorpal.CommandInstance, args) {
  const account = cache.accounts.find(
    (o) => o.currency === args.coin.toUpperCase()
  );
  if (!account || account.currency === "USD") {
    this.log("No such coin!");
    return;
  }
  printTable([account], "id", "balance", "available");
  const fills = await fetchFills(account.currency);
  if (fills.length === 0) {
    throw new Error("No fills found!");
  }
  printTable(
    fills,
    "created_at",
    "trade_id",
    "side",
    "price",
    "size",
    "fee",
    "usd_volume"
  );
});

fetchAccounts().then(() => {
  cli.log(`😎 Cached ${cache.accounts.length} accounts`);
  cli.delimiter("cbp$").show();
});
