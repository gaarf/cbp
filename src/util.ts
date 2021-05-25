import Table from "tty-table";
import BigNumber from "bignumber.js";
import chalk from "chalk";
import { formatDistanceToNow } from "date-fns";
import { Fill } from "coinbase-pro-node";
import { identity, startCase } from "lodash";

export function table<T>(a: T[], ...keys: Array<keyof T>) {
  const ks = keys.length ? keys.map(String) : Object.keys(a[0]);
  return Table(
    ks.map<Table.Header>((k) => ({
      value: k,
      alias: startCase(k),
      align: "right",
      headerAlign: "right",
      width: "auto",
      formatter: identity,
    })),
    a.map((o) =>
      ks.reduce(
        (memo, k) => ({
          ...memo,
          [k]: (function (v) {
            const s = String(v);
            if (k.endsWith("_at")) {
              return timeAgo(s);
            }
            if (/^[\d.]+$/.test(s) || k.endsWith("id")) {
              return numberFormat(s);
            }
            return s;
          })(o[k as keyof T]),
        }),
        {}
      )
    ),
    {
      compact: true,
    }
  ).render();
}

const USD_PREFIX = chalk.dim("$");
const PCT_SUFFIX = chalk.dim("%");

export function usdBoldNumber(input: string | BigNumber) {
  return USD_PREFIX + chalk.bold(numberFormat(input));
}

export function boldPercentage(a: BigNumber, b: BigNumber) {
  const pct = b.minus(a).dividedBy(a).multipliedBy(100);
  return chalk[pct.gt(0) ? "green" : "red"].bold(pct.toFormat(0)) + PCT_SUFFIX;
}

function numberFormat(input: string | BigNumber) {
  const b = new BigNumber(input);
  if(b.isEqualTo(b.integerValue())) {
    return b.toFormat(0);
  }
  return b.toFormat(b.gt(1000) ? 0 : 4);
}

function timeAgo(str: string) {
  return formatDistanceToNow(new Date(str), { addSuffix: true });
}

export function createdTimeAgo(fill: Fill) {
  return chalk.blue(timeAgo(fill.created_at));
}

function bigSum(set: Fill[], key: keyof Fill) {
  return set.reduce(
    (memo, one) => memo.plus(String(one[key])),
    new BigNumber(0)
  );
}

export function rawStats(fills: Fill[], side: string) {
  const c = fills.filter((o) => o.side === side);
  if (c.length === 0) {
    return;
  }
  const quantity = bigSum(c, "size");
  const fees = bigSum(c, "fee");
  const volume = bigSum(c, "usd_volume");
  const average = volume[side === 'buy' ? 'plus' : 'minus'](fees).dividedBy(quantity);
  return {
    side,
    quantity,
    volume,
    fees,
    average,
  };
}

export function statsFormat(input: ReturnType<typeof rawStats>) {
  return (
    input && {
      ...input,
      side: chalk[input.side === "buy" ? "green" : "red"](input.side),
      quantity: input.quantity.toFormat(),
      volume: USD_PREFIX + input.volume.toFormat(0),
      fees: USD_PREFIX + input.fees.toFormat(2),
      average: usdBoldNumber(input.average.toPrecision(4)),
    }
  );
}
