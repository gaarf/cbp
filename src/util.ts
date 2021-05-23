import Table from "tty-table";
import BigNumber from "bignumber.js";
import chalk from "chalk";
import { formatDistanceToNow } from "date-fns";
import { Fill } from "coinbase-pro-node";

export function table<T>(a: T[], ...keys: Array<keyof T>) {
  const ks = keys.length ? keys.map(String) : Object.keys(a[0]);
  return Table(
    ks.map<Table.Header>((k) => ({
      value: k,
      width: "auto",
      align: "right",
      headerAlign: "right",
      formatter(o) {
        if (k.endsWith("_at")) {
          return new Date(o).toLocaleString();
        }
        switch (k) {
          case "usd_volume":
          case "balance":
          case "available":
          case "price":
          case "hold":
          case "size":
            return new BigNumber(o).toFormat();
          default:
            return o;
        }
      },
    })),
    a,
    {
      compact: true,
    }
  ).render();
}

export function createdTimeAgo({ created_at: str }: Fill) {
  return chalk.blue(formatDistanceToNow(new Date(str), { addSuffix: true }));
}

function bigSum(set: Fill[], key: keyof Fill) {
  return set.reduce(
    (memo, one) => memo.plus(String(one[key])),
    new BigNumber(0)
  );
}

function stats(fills: Fill[], side: string) {
  const c = fills.filter((o) => o.side === side);
  if (c.length === 0) {
    return;
  }
  const size = bigSum(c, "size");
  const fees = bigSum(c, "fee");
  const volume = bigSum(c, "usd_volume");
  const perCoin = volume.plus(fees).dividedBy(size);
  const prefix = chalk.dim("$");
  return {
    side: chalk[side === "buy" ? "green" : "red"](side),
    quantity: size.toFormat(),
    volume: prefix + volume.toFormat(2),
    fees: prefix + fees.toFormat(2),
    average: prefix + chalk.bold(perCoin.toFormat(2)),
  };
}

export function statsTable(fills: Fill[]) {
  return table([stats(fills, "buy"), stats(fills, "sell")].filter((o) => o));
}
