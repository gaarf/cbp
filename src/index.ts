import dotenv from "dotenv";
import Vorpal, { Args } from "vorpal";
import { Account, CoinbasePro, RESTClient } from "coinbase-pro-node";
import BigNumber from "bignumber.js";
import { table, createdTimeAgo, statsTable } from "./util";
import type { Question } from "inquirer";
import { exec } from "child_process";

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

const coinQuestion: Question = {
  name: "coin",
  message: "Which coin?",
  default: "BTC",
  filter: (coin) => coin.toUpperCase(),
};

async function fetchAccounts() {
  const a = await cbp.rest.account.listAccounts();
  a.filter((o) => !o.currency.startsWith("USD")).forEach(
    (o) => (accounts[o.currency] = o)
  );
  Object.assign(coinQuestion, {
    type: "list",
    choices: Object.keys(accounts),
  });
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

async function computeAverage(this: Vorpal.CommandInstance, { coin }: Args) {
  const COIN = coin.toUpperCase();
  const account = accounts[COIN];
  if (!account) {
    this.log(`❌ ${COIN} is not a supported coin!`);
    return;
  }

  const fills = await fetchFills(account.currency);
  if (fills.length === 0) {
    return;
  }

  this.log("Latest:", createdTimeAgo(fills[0]));
  this.log("Oldest:", createdTimeAgo(fills[fills.length - 1]));
  this.log(statsTable(fills));
}

cli
  .command("stats [coin]")
  .option("--euro", "Use Euros instead of US dollars")
  .action(async function (this: Vorpal.CommandInstance, args) {
    let coin = args.coin;
    if (!coin) {
      const p = await this.prompt(coinQuestion);
      coin = p.coin;
    }
    this.log(
      table([
        await cbp.rest.product.getProductStats(
          `${coin}-${args.options.euro ? "EUR" : "USD"}`
        ),
      ])
    );
  });

cli
  .command("orders [coin]")
  .action(async function (this: Vorpal.CommandInstance, args) {
    let coin = args.coin;
    if (!coin) {
      const p = await this.prompt(coinQuestion);
      coin = p.coin;
    }
    const orders = await cbp.rest.order.getOrders({
      product_id: accounts[coin.toUpperCase()].id,
    });
    this.log(
      table(orders.data, "product_id", "side", "price", "size", "status")
    );
  });

cli.command("fees", "Current fee structure").action(async function (this: Vorpal.CommandInstance, args) {
  this.log(table([await cbp.rest.fee.getCurrentFees()]));
});

cli.command("history", "Account history").action(async function (this: Vorpal.CommandInstance) {
  const { coin } = await this.prompt(coinQuestion);
  const history = await cbp.rest.account.getAccountHistory(accounts[coin].id);
  this.log(table(history.data, 'created_at', 'amount', 'type'));
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

cli.command("average <coin>", "Compute average cost").action(computeAverage);

cli.catch("<coin>").action(async function (this: Vorpal.CommandInstance, args) {
  if (args.coin.toUpperCase() in accounts) {
    return computeAverage.call(this, args);
  }
  cli.exec("help");
});

fetchAccounts().then(() => {
  cli.log(`😎 ${Object.keys(accounts).length} accounts`);
  const [a, b, ...c] = process.argv;
  if (c.length) {
    cli.delimiter("").show();
    cli.exec(c.join(" "));
    cli.exec("exit");
  } else {
    cli.delimiter("cbp$").show();
  }
});
