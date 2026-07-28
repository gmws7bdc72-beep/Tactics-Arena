# FTA Mobile Curve + Top-Down Update

## Mobile match view
- Removed the proposed 2x2 mechanic grid.
- Match camera is fixed to a straight top-down view on phones.
- Phone matches render the pitch only: no crowd, stands, stadium surround, or commentary panel.
- Scoreboard and controls now float over the pitch instead of reducing pitch height.
- Player actions use one shallow horizontal dock.
- Bottom controls, labels, spacing, and general mobile scale were reduced.
- Mobile text containers now shrink, wrap, or truncate instead of spilling outside boxes.
- Online match view receives the same top-down, pitch-only mobile treatment.

## Curve mechanic
- Luck is replaced by Movement, with saved-data migration from the old Luck value.
- Movement controls the number of curve points:
  - 1-4: 2 points
  - 5-6: 3 points
  - 7-8: 4 points
  - 9-10: 5 points
- Curves work for dribbling, ground passes, long balls, and shots.
- Curved routes use chained control points.
- AI curves only when an opponent blocks the direct route; it does not curve randomly.
- Removed the dribble-curve-too-long warning. Player speed naturally limits how far the player travels during the turn.
