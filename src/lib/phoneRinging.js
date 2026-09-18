// At most three rings; caller owns cancellation when answered/hidden/unmounted.
export function startPhoneRinging(play, schedule = setInterval, cancel = clearInterval) {
 let count = 1;
 play();
 const timer = schedule(() => {
  if (count >= 3) { cancel(timer); return; }
  count++; play();
  if (count >= 3) cancel(timer);
 }, 4000);
 return () => cancel(timer);
}
