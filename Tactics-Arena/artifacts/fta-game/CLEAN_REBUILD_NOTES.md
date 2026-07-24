# Football Tactics Arena — Clean Rebuild 6v6

Build ID: clean-rebuild-6v6-v1

This build was rebuilt from a stable project folder instead of stacked patches.

## Main changes

- 6v6 everywhere: constants, formations, player squads, AI teams, match creation, team setup, and profiles.
- Full player stat profiles: shooting, dribbling, tackling, marking, stamina, strength/physique, vision, long passing, aerial, plus legacy attack/defense/passing/speed/luck.
- Team tactics for every AI team: slow possession, balanced build-up, direct play, counter press, low block counter, quick counterattack, wide crossing, and long-ball target-man.
- Team Profiles screen: shows all 6 players, stats, tactic sliders, and tactic descriptions.
- League-table profile routing: clicking a team row opens that exact team profile.
- Long Ball for both user and AI: manual button/key, aerial tracking, directional interception zones near passer/receiver, and landing contests.
- Better AI shooting: AI shoots more from good zones and when open instead of always dribbling to the final line.
- Contact/duel rewrite: same-tile no-ball collisions use physique/strength; ball carrier uses dribbling vs defense; stationary defenders now challenge carriers who run through them.
- Rest defender rule: at least one defender stays significantly deeper behind the attack.
- Blue visible test code removed.

## Visible verification

Home screen displays: `Build: Clean Rebuild 6v6`.
