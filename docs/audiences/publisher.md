## What it is, in your terms 

Your rules over your own demand paths.

As a publisher, you sell the same impression across multiple paths: 
direct integrations, SSPs, resellers. What you decide about each one is 
tied to a bidder list, ad server setup, or a config file, and it is the 
only place where you can change it. 

xdd-smash is a framework you run on your own infrastructure. Your paths 
sit behind one endpoint, and your rules run there, in logic that config 
cannot hold: which paths receive a particular impression, whether the schain 
is correct before a request reaches a demand partner, the floor you ask of 
each one, and which bids enter your auction.

## What it does not replace 

**Your auction.** Whether you use Prebid Server, your primary ad server or a 
third-party wrapper, this system still decides who competes in it and 
chooses the winner. The framework sits on one path into it.

**Your ad server pricing.** Line items and the minimum your inventory has 
to earn remain where they are. 

**Your analytics.** Whether a rule earned more is something your own reporting answers.


## Example 

The same first-party data segment has to arrive in a different shape for 
each demand partner. Wrapper config controls the access, but not the form. 
Behind one endpoint it is a function per partner.

Testing a new direct integration often requires building a custom adapter, 
updating configs, and waiting for a release to route traffic. With xdd-smash, 
that integration shares your main endpoint, and a routing rule decides what inventory it sees. 

A demand partner sends back creatives you cannot run, and turning the partner 
off costs you the fill rate on everything else they bid on. A rule can drop 
these bids as they come back, or route only part of the traffic away from that 
partner while you measure what it costs. 

Each of these is one rule, scoped to one path. 

_Code example goes here_ 

## Why not a Prebid Server module 

Prebid Server has hooks of its own, and its documentation names first-party data, 
floors and bidder filtering among the things they are for. The difference is what 
a change costs you. A module is Go or Java, compiled into your build of Prebid 
Server. Changing one means building and deploying Prebid Server. 

A feature in xdd-smash is a directory with a function in it, deployed on its own, 
and Prebid Server never knows it changed. A module decides which of your bidders 
see a request. Behind one endpoint you also decide what goes into that request 
and what comes back from it. 

Connecting the framework to Prebid Server is configuration on your side, not an 
adapter to write. 

## What it takes to run it

- Node 22+ (runs alongside your stack, whatever it is)
- A way to transform the request your stack sends into [ctx](../framework.md), which every hook receives
- Your demand behind one endpoint, with per-path config in your hands
- A store to read per-path state from, if your rules need one 
- A developer for the first rule
