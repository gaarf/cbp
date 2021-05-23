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
        switch(k) {
          case 'usd_volume':
          case 'price':
          case 'size':
            return new BigNumber(o).toFormat()
          default: {
            return o;
          }            
        }

      },
    })),
    a
  ).render();
}


export function timeAgo(str: string) {
  return chalk.blue(formatDistanceToNow(new Date(str), { addSuffix: true }));
}


export function buyStats(fills: Fill[]) {
  const buys = fills.filter(o => o.side === 'buy');
  return table(buys, 'product_id', 'price', 'size', 'fee', 'usd_volume');
}


export function sellStats(fills: Fill[]) {
  const sells = fills.filter(o => o.side === 'sell');
  return table(sells, 'product_id', 'price', 'size', 'fee', 'usd_volume');
}

export function pricePerCoin(fills: Fill[]) {
  return chalk.bgRed.white('FIXME');
}