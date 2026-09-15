package lineage

type KinshipTermParameters struct {
	GenerationsUp   int `json:"generations_up,omitempty"`
	GenerationsDown int `json:"generations_down,omitempty"`
	SharedParents   int `json:"shared_parents,omitempty"`
	KnownParentsA   int `json:"known_parents_a,omitempty"`
	KnownParentsB   int `json:"known_parents_b,omitempty"`
}

type KinshipTerm struct {
	Perspective string                `json:"perspective"`
	Key         string                `json:"key"`
	Gender      string                `json:"gender"`
	Modifiers   []string              `json:"modifiers,omitempty"`
	Parameters  KinshipTermParameters `json:"parameters"`
	Confidence  string                `json:"confidence"`
}

func classifyKinshipTerm(
	path []KinshipSegment,
	targetGender string,
	parentsA []string,
	parentsB []string,
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

	sharedParents := sharedCount(parentsA, parentsB)
	if sharedParents > 0 {
		term.Key = "sibling"
		term.Parameters.SharedParents = sharedParents
		term.Parameters.KnownParentsA = len(parentsA)
		term.Parameters.KnownParentsB = len(parentsB)
		if sharedParents >= 2 {
			term.Modifiers = []string{"full"}
		}
		return term
	}

	term.Key = "related"
	return term
}

func relationsMatch(path []KinshipSegment, relation string) bool {
	for _, segment := range path {
		if segment.Relation != relation {
			return false
		}
	}
	return true
}

func sharedCount(left []string, right []string) int {
	values := make(map[string]bool, len(right))
	for _, value := range right {
		values[value] = true
	}
	count := 0
	for _, value := range left {
		if values[value] {
			count++
		}
	}
	return count
}
