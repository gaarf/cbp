import dotenv from "dotenv";
import Vorpal, { Args } from "vorpal";
import { Account, CoinbasePro } from "coinbase-pro-node";
import BigNumber from "bignumber.js";
import { table, timeAgo, statsTable } from "./util";
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
  a.filter((o) => !o.currency.startsWith("USD")).forEach(
    (o) => (accounts[o.currency] = o)
  );
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

  this.log("Oldest:", timeAgo(fills[fills.length - 1].created_at));
  this.log("Latest:", timeAgo(fills[0].created_at));
  this.log(statsTable(fills));
}

cli
  .command("list", "List supported coins")
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

cli
  .command("prompt", "Prompt from the list of coins")
  .action(async function (this: Vorpal.CommandInstance) {
    const { coin } = await this.prompt({
      name: "coin",
      type: "list",
      message: "Which coin?",
      choices: Object.keys(accounts),
    } as Question);
    await cli.execSync(coin);
  });

cli.command("average <coin>", "Compute average cost").action(computeAverage);
cli.catch("<coin>").action(computeAverage);

fetchAccounts().then(() => {
  cli.log(`😎 ${Object.keys(accounts).length} supported accounts`);
  const [a, b, ...c] = process.argv;
  if (c.length) {
    cli.exec(c.join(" ")).then(() => process.exit());
  } else {
    cli.delimiter("cbp$").show();
  }
});
