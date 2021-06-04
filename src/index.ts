import dotenv from "dotenv";
import Vorpal, { Args } from "vorpal";
import { Account, CoinbasePro } from "coinbase-pro-node";
import BigNumber from "bignumber.js";
import {
  table,
  createdTimeAgo,
  rawStats,
  statsFormat,
  usdBoldNumber,
  boldPercentage,
} from "./util";

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
  a.filter((o) => !o.currency.startsWith("USD")).forEach(
    (o) => (accounts[o.currency] = o)
  );
}

async function getAccount(this: Vorpal.CommandInstance, { coin }: Args) {
  const COIN =
    (coin || "").toUpperCase() ||
    (
      await this.prompt({
        name: "coin",
        message: "Which coin?",
        default: "BTC",
        filter: (o: string) => o.toUpperCase(),
        type: "list",
        choices: Object.keys(accounts),
      })
    ).coin;
  const account = accounts[COIN];
  if (!account) {
    throw new Error(`${COIN} is not a supported coin!`);
  }
  return account;
}

async function fetchFills(currency: string) {
  const output = [];
  const limit = 100;
  let result,
    after,
    hasMore = true;
  const product = `${currency}-USD`;
  while (hasMore) {
    result = await cbp.rest.fill.getFillsByProductId(
      product,
      after ? { after, limit } : { limit }
    );
    output.push(...result.data);
    hasMore = result.data.length === limit;
    after = result.pagination.after;
    cli.log(hasMore ? "fetching..." : `🐶 ${output.length} ${product} fills`);
  }
  return output;
}

async function computeAverage(this: Vorpal.CommandInstance, args: Args) {
  const account = await getAccount.call(this, args);

  const fills = await fetchFills(account.currency);
  if (fills.length === 0) {
    return;
  }

  this.log("");
  this.log("Latest fill:", createdTimeAgo(fills[0]));
  this.log("Oldest fill:", createdTimeAgo(fills[fills.length - 1]));

  const ticker = await cbp.rest.product.getProductTicker(
    `${account.currency}-USD`
  );

  const buys = rawStats(fills, "buy");
  const sells = rawStats(fills, "sell");

  this.log(table([statsFormat(buys), statsFormat(sells)]));

  const price = new BigNumber(ticker.price);
  this.log("\nMarket:", usdBoldNumber(price));

  if (buys) {
    this.log(
      "Change:",
      buys.average.gt(price) ? "😭" : "📈",
      boldPercentage(buys.average, price)
    );
  }
  this.log("");
}

cli
  .command("market [coin]", "Display market information")
  .option("--euro", "Use Euros instead of US dollars")
  .action(async function (this: Vorpal.CommandInstance, args: Args) {
    const account = await getAccount.call(this, args);
    this.log(
      table([
        await cbp.rest.product.getProductStats(
          `${account.currency}-${args.options.euro ? "EUR" : "USD"}`
        ),
      ])
    );
  });

cli
  .command("fees", "Display current fee structure")
  .action(async function (this: Vorpal.CommandInstance) {
    this.log(table([await cbp.rest.fee.getCurrentFees()]));
  });

cli
  .command("list", "List accounts")
  .option("--all", "Include empty balance")
  .action(async function (this: Vorpal.CommandInstance, args) {
    this.log(
      table(
        Object.values(accounts).filter(
          (a) => args.options.all || new BigNumber(a.balance).gt(0.01)
        ),
        "currency",
        "balance"
      )
    );
  });

cli.command("average [coin]", "Compute average cost").action(computeAverage);

cli.catch("<coin>").action(async function (this: Vorpal.CommandInstance, args) {
  if (args.coin.toUpperCase() in accounts) {
    return computeAverage.call(this, args);
  }
  cli.exec("help");
});

fetchAccounts().then(() => {
  const [a, b, ...c] = process.argv;
  if (c.length) {
    cli.delimiter("").show();
    cli.exec(c.join(" "));
    cli.exec("exit");
  } else {
    cli.log(`😎 ${Object.keys(accounts).length} accounts`);
    cli.delimiter("cbp$").show();
    cli.log("")
  }
});
