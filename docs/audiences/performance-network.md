## What it is, in your terms

Bring your tracker's signal into the bid path.

As a performance network, you already know which combinations pay - your 
tracker works it out from the postbacks you receive every day. The question 
is what it costs to act on that at request time.

xdd-smash is a framework you run on your own infrastructure, between your 
supply and your demand. Your tracker can write what it knows, keyed on 
whatever the request already carries.

The key is a string you agree on once, and your rule reads it while the 
request is in the pipeline. It can be built from a combination your platform 
has no field for, with the signal updated as the postbacks come in.

One value, read twice: on the way out, to choose the seat or endpoint, and 
on the way back, to filter the bids that reach your supply. Run it on one 
partner or one slice of traffic first, with nothing else touched.

## What it does not replace

**Your tracker.** Attribution, the thresholds behind the signal, and the postback 
windows they run on stay where they are.

**Your bidding engine.** The framework acts on what goes out and what comes 
back in the pipeline. Your engine still sets the price and picks what wins.

**Your analytics.** Whether the rule earned more is something your own reporting 
answers, from the same data the signal came from.

## Example

One offer pays on a confirmed trial. The install rate is flat across your 
sources, but the trial rate is not, and nothing in your targeting separates them.

A demand partner has an offer you are close to losing. It converts on a specific 
traffic slice, which changes every week, so today you either keep the source 
as it is or drop it.

Another buyer has never converted on one combination, and you would rather 
filter their bids out before they reach your supply.

Each of these is one key and one rule. Run it on part of the traffic, and the 
comparison lands in the same tracker as everything else.

_Code example goes here_

## What it takes to run it

- Node 22+ (the framework runs alongside your platform if your stack is something else)
- A way to turn your request object into [ctx](../framework.md), which every hook receives
- One key scheme, agreed between your tracker and the rule that reads it
- A store fast enough to read on every request, and a job on the tracker side that keeps it up to date
- A developer for the first rule
