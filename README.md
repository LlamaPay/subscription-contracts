# Subscriptions
Contract for charging recurring subscriptions while having subscribers also earn yield on their deposits through ERC4626-compatible vaults.

Main benefit of it is that it automates payments and, if users deposit enough money so that yield is higher than payments, the subscription actually becomes free. This doesn't require a lot of money, for a subscription of 5$/mo users would only need to deposit 1.2k for it to be free with sDAI yields.

When a new subscription is created, the subscriber will be instantly charged pro-rata for the time left till the end of the period, afterwards they will be charged for a full period at the beginning of each period. If they unsubscribe they'll be returned the money for any periods left till their subscription expires, plus all the yield they've earned, however payment for the current period won't be returned.

Contract charges a 1% fee on volume that is paid through subscriptions, which is collected when the receiver of the subscription claims their earnings.

## Design decisions
Another possible design would have been to have a liquidation system where bots could call accounts for which total paid in subscriptions is higher than their account balance, and remove their payments from `amountPerPeriod` of the receiver, thus ensuring that `amountPerPeriod` always only has subscriptions that are up to date. This system has a few benefits:
- You don't need to handle cases where subscription ended some time ago (since subscriptions are terminated through a bot tx when they expire), so you don't need to track `sharesPerPeriod`, which makes operations always O(1) and bounded, eliminating the 10 years of inactivity problem
- Reduces gas costs because you don't need to store `sharesPerPeriod` nor `receiverAmountToExpire`
- Users can just top up all their streams in a single operation instead of having to top up streams one by one, also all streams feed from a single balance so there's no fragmentation, which provides a better UX

However, the big issue is that if, for any reason, these liquidation bots stop working, it would be possible for an attacker to create an extremely expensive stream to itself and just let it run, since it wont get liquidated by bots it will keep going, transferring non-existing money to the receiver and allowing the attacker to drain the contract and steal from every other user.

So this design relies on these liquidation bots working all the time, otherwise contracts are drained. While it's possible to incentivize liqudations with a reward, these will likely be extremely small and there's a high probability that the only one running bots will be the team, making the whole thing very fragile. I've opted to use a different design for this reason, to remove the reliance on lively liquidation bots and ensure safety always.

## Commands
```shell
npm i
npm build
npm test
REPORT_GAS=true npm test
export $(echo $(cat .env | sed 's/#.*//g'| xargs) | envsubst) && npx hardhat deploy --network optimism
export $(echo $(cat .env | sed 's/#.*//g'| xargs) | envsubst) && npx hardhat etherscan-verify --network optimism
export $(echo $(cat .env | sed 's/#.*//g'| xargs) | envsubst) && npx hardhat verify --network optimism DEPLOYED_CONTRACT_ADDRESS
export $(echo $(cat .env | sed 's/#.*//g'| xargs) | envsubst) && npx hardhat run scripts/liveTest.ts --network optimism
```
