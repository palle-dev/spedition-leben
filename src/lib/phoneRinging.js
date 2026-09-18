// At most three rings; caller owns cancellation when answered/hidden/unmounted.
export function startPhoneRinging(play, schedule = setInterval, cancel = clearInterval, limit = 3) {
 if (limit <= 0) return () => {};
 let count = 1;
 play();
 if (limit === 1) return () => {};
 const timer = schedule(() => {
  if (count >= limit) { cancel(timer); return; }
  count++; play();
  if (count >= limit) cancel(timer);
 }, 4000);
 return () => cancel(timer);
}
