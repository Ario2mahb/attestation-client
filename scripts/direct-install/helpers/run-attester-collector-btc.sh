# Path to config json. By default it seeks file named config.json in the root folder
CONFIG_PATH=${1:-./configs/config.json}

# Compile typescript
# yarn tsc

# Run DataProvider
# node dist/src/spammer/attestation-spammer.js
yarn ts-node src/spammer/attestation-collector.ts \
    -c BTC \
    -r http://127.0.0.1:9650/ext/bc/C/rpc \
    -a artifacts/contracts/StateConnector.sol/StateConnector.json \
    -t $(cat .stateconnector-address) \
    -u http://34.159.118.250:9332/ \
    -s flareadmin \
    -p mcaeEGn6CxYt49XIEYemAB-zSfu38fYEt5dV8zFmGo4= \
    -b 100 \
    -o 1 \
    -f 6 \
    -w 1000 \
    -d 100 \
    -l BTC
