
[x] split database to indexer and attester
[x] all settings from .env to config
[x] rename config.json tp config-attester.json
[x] config.json chain metadata is redundant - delete and check
[x] config.json numberOfConfirmations are to be used from DAC
[x] move config.json queryWindowSec to DAC
[x] credential config (with database and network credentials)
[x] add another table for ALL attesttaion request
[x] configs are not specified by specific file but by directory
[x] .env only config pack folder  CONFIG_PATH
[ ] create json files dynamic checker (with tsc)
[ ] reverification buf in verification (too often) local not updated DB 
[ ] handling system_failure blocks
[x] cleanup spammer config definitions

[x] at start use network to collect all events for active epoch
[x] save attester state into DB
[x] save attester nounce and txid when commited and revealed (for easy debugging)
[x] make DEV build not submit into network and use local DB
[ ] gracefull exit/restart (kill -2)
[ ] custom tail with our logger
[ ] RPC exception (unhandled promise ~524 timeout ....)
[x] signAndFinalize for wait check if we are still in round epoch!
[x] set transactionPollingTimeout settable from config (error mining not done in 750 seconds)
[x] display nounce and txid for receipt on sign done

[ ] rename interlaceTimeRange => minimalStorageHistoryDays
[ ] rename interlaceBlockRange => minimalStorageHistoryBlocks