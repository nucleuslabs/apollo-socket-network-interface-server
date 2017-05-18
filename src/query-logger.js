import Chalk from 'chalk';
import prettyTime from 'pretty-hrtime';
import {print} from 'graphql';
import makeDebug from 'debug';
const debug = makeDebug('asnis');

export default function queryLogger() {
    let start = process.hrtime();
    return function done(prefix, query) {
        const elapsed = process.hrtime(start);
        let time = prettyTime(elapsed);
        const ms = elapsed[0]*1e3 +elapsed[1]/1e6;
        if(ms >= 50) {
            time = Chalk.red(time);
        } else if(ms >= 25) {
            time = Chalk.yellow(time);
        } else {
            time = Chalk.grey(time);
        }
        if(typeof query === 'object') {
            query = print(query);
        }
        debug(`${prefix} ${query.trim()} ${time}`);
    }
}
