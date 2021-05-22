import Table from "tty-table";
import BigNumber from "bignumber.js";
import chalk from "chalk";
import { formatDistanceToNow } from "date-fns";

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
        if (k.endsWith("_id")) {
          return o;
        }
        return isNaN(o) ? o : new BigNumber(o).toFormat()
      },
    })),
    a
  ).render();
}


export function timeAgo(str: string) {
  return chalk.green(formatDistanceToNow(new Date(str), { addSuffix: true }));
}
