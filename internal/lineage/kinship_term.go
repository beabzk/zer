package lineage

type KinshipTermParameters struct {
	GenerationsUp   int    `json:"generations_up,omitempty"`
	GenerationsDown int    `json:"generations_down,omitempty"`
	SharedParents   int    `json:"shared_parents,omitempty"`
	KnownParentsA   int    `json:"known_parents_a,omitempty"`
	KnownParentsB   int    `json:"known_parents_b,omitempty"`
	UnionStatus     string `json:"union_status,omitempty"`
	Degree          *int   `json:"degree,omitempty"`
	Removed         *int   `json:"removed,omitempty"`
	GreatCount      *int   `json:"great_count,omitempty"`
}

type KinshipTerm struct {
	Perspective string                `json:"perspective"`
	Key         string                `json:"key"`
	Gender      string                `json:"gender"`
	Modifiers   []string              `json:"modifiers,omitempty"`
	Parameters  KinshipTermParameters `json:"parameters"`
	Confidence  string                `json:"confidence"`
}

type kinshipParent struct {
	ID               string
	RelationshipType string
}

type kinshipUnion struct {
	Type   string
	Status string
}

func classifyKinshipTerm(
	path []KinshipSegment,
	targetGender string,
	parentsA []kinshipParent,
	parentsB []kinshipParent,
	parentsByPerson map[string][]kinshipParent,
	parentUnion *kinshipUnion,
) KinshipTerm {
	term := KinshipTerm{
		Perspective: "a_to_b",
		Gender:      targetGender,
		Confidence:  "exact",
	}

	if len(path) == 0 {
		term.Key = "self"
		return term
	}
	if len(path) == 1 {
		switch path[0].Relation {
		case RelationParent:
			term.Key = "parent"
			return term
		case RelationChild:
			term.Key = "child"
			return term
		case RelationSpouse:
			term.Key = "spouse"
			return term
		}
	}

	if relationsMatch(path, RelationParent) {
		term.Key = "ancestor"
		term.Parameters.GenerationsUp = len(path)
		return term
	}
	if relationsMatch(path, RelationChild) {
		term.Key = "descendant"
		term.Parameters.GenerationsDown = len(path)
		return term
	}
	if classifySibling(&term, parentsA, parentsB, parentUnion) {
		return term
	}
	if classifyMarriedCollateral(&term, path, parentsByPerson) {
		return term
	}
	if classifyStepAunt(&term, path) {
		return term
	}
	if classifyParentChildCollateral(&term, path, parentsByPerson) {
		return term
	}

	term.Key = "related"
	return term
}

func classifySibling(
	term *KinshipTerm,
	parentsA []kinshipParent,
	parentsB []kinshipParent,
	parentUnion *kinshipUnion,
) bool {
	shared := sharedParents(parentsA, parentsB)
	term.Parameters.KnownParentsA = len(parentsA)
	term.Parameters.KnownParentsB = len(parentsB)

	if len(shared) > 0 {
		term.Key = "sibling"
		term.Parameters.SharedParents = len(shared)
		modifiers, confidence := relationshipModifiers(parentsA, parentsB, true)
		term.Modifiers = modifiers
		term.Confidence = confidence
		return true
	}

	if parentUnion == nil {
		return false
	}
	term.Key = "sibling"
	term.Parameters.UnionStatus = parentUnion.Status
	if parentUnion.Status == "DISSOLVED" {
		term.Modifiers = []string{"former", "step"}
	} else {
		term.Modifiers = []string{"step"}
	}
	return true
}

func classifyMarriedCollateral(
	term *KinshipTerm,
	path []KinshipSegment,
	parentsByPerson map[string][]kinshipParent,
) bool {
	if len(path) < 4 || path[len(path)-1].Relation != RelationSpouse {
		return false
	}
	prefix := path[:len(path)-1]
	if !classifyParentChildCollateral(term, prefix, parentsByPerson) {
		return false
	}
	if term.Key != "aunt_uncle" && term.Key != "niece_nephew" {
		return false
	}
	if path[len(path)-1].UnionStatus == "DISSOLVED" {
		term.Modifiers = append(term.Modifiers, "former", "by_marriage")
	} else {
		term.Modifiers = append(term.Modifiers, "by_marriage")
	}
	term.Parameters.UnionStatus = path[len(path)-1].UnionStatus
	return true
}

func classifyStepAunt(term *KinshipTerm, path []KinshipSegment) bool {
	if len(path) < 4 || path[0].Relation != RelationParent || path[1].Relation != RelationSpouse {
		return false
	}
	up, down, ok := parentChildTurns(path[2:])
	if !ok || down != 1 {
		return false
	}
	term.Key = "aunt_uncle"
	term.Modifiers = append(term.Modifiers, "step")
	if path[1].UnionStatus == "DISSOLVED" {
		term.Modifiers = append(term.Modifiers, "former")
	}
	if up > 1 {
		greatCount := up - 1
		term.Parameters.GreatCount = &greatCount
		term.Modifiers = append(term.Modifiers, "great")
	}
	term.Parameters.UnionStatus = path[1].UnionStatus
	return true
}

func classifyParentChildCollateral(
	term *KinshipTerm,
	path []KinshipSegment,
	parentsByPerson map[string][]kinshipParent,
) bool {
	up, down, ok := parentChildTurns(path)
	if !ok || up == 0 || down == 0 || (up == 1 && down == 1) {
		return false
	}

	leftChildID := pathNodeID(path, up-1)
	rightChildID := pathNodeID(path, up+1)
	modifiers, confidence := relationshipModifiers(
		parentsByPerson[leftChildID], parentsByPerson[rightChildID], false,
	)
	term.Confidence = confidence

	switch {
	case up >= 2 && down == 1:
		term.Key = "aunt_uncle"
		modifiers = withoutModifier(modifiers, "full")
		if up > 2 {
			greatCount := up - 2
			term.Parameters.GreatCount = &greatCount
			modifiers = append(modifiers, "great")
		}
	case up == 1 && down >= 2:
		term.Key = "niece_nephew"
		modifiers = withoutModifier(modifiers, "full")
		if down > 2 {
			greatCount := down - 2
			term.Parameters.GreatCount = &greatCount
			modifiers = append(modifiers, "great")
		}
	case up >= 2 && down >= 2:
		term.Key = "cousin"
		degree := min(up, down) - 1
		removed := abs(up - down)
		term.Parameters.Degree = &degree
		term.Parameters.Removed = &removed
	default:
		return false
	}
	term.Modifiers = modifiers
	return true
}

func relationshipModifiers(
	parentsA []kinshipParent,
	parentsB []kinshipParent,
	fullWhenKnownSetsMatch bool,
) ([]string, string) {
	shared := sharedParents(parentsA, parentsB)
	biological := 0
	adoptive := 0
	foster := 0
	for _, parent := range shared {
		switch parent.RelationshipType {
		case "ADOPTIVE":
			adoptive++
		case "FOSTER":
			foster++
		default:
			biological++
		}
	}

	if biological > 0 {
		if biological >= 2 || (fullWhenKnownSetsMatch && sameParentIDs(parentsA, parentsB)) {
			return []string{"full"}, "exact"
		}
		if len(parentsA) > 1 && len(parentsB) > 1 &&
			len(shared) < len(parentsA) && len(shared) < len(parentsB) {
			return []string{"half"}, "exact"
		}
		return nil, "incomplete_parent_records"
	}
	if adoptive > 0 {
		return []string{"adoptive"}, "exact"
	}
	if foster > 0 {
		return []string{"foster"}, "exact"
	}
	return nil, "incomplete_parent_records"
}

func parentChildTurns(path []KinshipSegment) (int, int, bool) {
	up := 0
	for up < len(path) && path[up].Relation == RelationParent {
		up++
	}
	down := 0
	for i := up; i < len(path); i++ {
		if path[i].Relation != RelationChild {
			return 0, 0, false
		}
		down++
	}
	return up, down, true
}

func pathNodeID(path []KinshipSegment, index int) string {
	if index == 0 {
		return path[0].FromID
	}
	return path[index-1].ToID
}

func relationsMatch(path []KinshipSegment, relation string) bool {
	for _, segment := range path {
		if segment.Relation != relation {
			return false
		}
	}
	return true
}

func sharedParents(left []kinshipParent, right []kinshipParent) []kinshipParent {
	byID := make(map[string]kinshipParent, len(right))
	for _, parent := range right {
		byID[parent.ID] = parent
	}
	var shared []kinshipParent
	for _, parent := range left {
		if other, ok := byID[parent.ID]; ok {
			shared = append(shared, other)
		}
	}
	return shared
}

func sameParentIDs(left []kinshipParent, right []kinshipParent) bool {
	if len(left) != len(right) {
		return false
	}
	values := make(map[string]bool, len(right))
	for _, parent := range right {
		values[parent.ID] = true
	}
	for _, parent := range left {
		if !values[parent.ID] {
			return false
		}
	}
	return true
}

func withoutModifier(modifiers []string, modifier string) []string {
	out := make([]string, 0, len(modifiers))
	for _, value := range modifiers {
		if value != modifier {
			out = append(out, value)
		}
	}
	return out
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
