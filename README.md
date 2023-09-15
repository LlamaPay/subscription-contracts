# Subs
Possible approaches:
- Single deposit pot + bot that triggers liquidation on sub streams when balance gets too low
  - Issues: security is dependent on liquidation bot working properly
  - Advantage:
    - Good UX (no need to rebalance subs + better mental model)
    - low gas since you just need to deposit into a single pot
    - streams can be infinite if yield > payments
    - all operations are O(1)
- Use 


## Calculate total yield earnings
- Can solve the issue of ppl joining mid-term by just making them pay for yield up until now, and same for when they leave, just need to reduce the shares balance proportionally.

## Commands
```shell
npm build
npm test
REPORT_GAS=true npm test
npx hardhat run scripts/deploy.ts
```
