export async function getSub(call: Promise<any>){
  return (await (await call).wait())?.logs.find((l:any)=>l.topics[0]==="0x75aabd19e348827dfa0d37beb9ada0c4ccaec489ee6d4f754b579b7722f210bc").args
}

export function unsubscribeParams(sub:any){
  return [sub.initialPeriod, sub.expirationDate, sub.amountPerCycle, sub.receiver, sub.accumulator, sub.initialShares] as [any, any, any, any, any, any]
}