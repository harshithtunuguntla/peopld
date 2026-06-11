from typing import List, Dict


def assign_tables(
    arrived_attendee_ids: List[str],
    past_pairings: Dict[str, set],
    num_tables: int,
    seats_per_table: int,
) -> Dict[str, int]:
    """
    Greedy rotation algorithm.
    Returns {attendee_id: table_number} for the current round.

    Strategy (to be designed in full before implementation):
    - Minimize repeated pairings across rounds
    - Handle odd numbers (one table may have fewer seats)
    - Handle mid-event arrivals/departures

    TODO: implement after design session
    """
    raise NotImplementedError("Algorithm design session required before implementation")
