export async function getSub(call: Promise<any>, eventName="NewSubscription"){
  return (await (await call).wait())?.logs.find((l:any)=>l.fragment?.name===eventName).args
}

export function unsubscribeParams(sub:any){
  return [sub.initialPeriod, sub.expirationDate, sub.amountPerCycle, sub.receiver, sub.accumulator, sub.initialShares] as [any, any, any, any, any, any]
}