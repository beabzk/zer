package lineage

type KinshipTermParameters struct {
	GenerationsUp   int    `json:"generations_up,omitempty"`
	GenerationsDown int    `json:"generations_down,omitempty"`
	SharedParents   int    `json:"shared_parents,omitempty"`
	KnownParentsA   int    `json:"known_parents_a,omitempty"`
	KnownParentsB   int    `json:"known_parents_b,omitempty"`
	UnionStatus     string `json:"union_status,omitempty"`
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
	parentsA []kinshipParent,
	parentsB []kinshipParent,
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

	term.Key = "related"
	return term
}

type kinshipParent struct {
	ID               string
	RelationshipType string
}

type kinshipUnion struct {
	Type   string
	Status string
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

		switch {
		case biological > 0:
			if biological >= 2 || sameParentIDs(parentsA, parentsB) {
				term.Modifiers = []string{"full"}
			} else if len(parentsA) > 1 && len(parentsB) > 1 &&
				len(shared) < len(parentsA) && len(shared) < len(parentsB) {
				term.Modifiers = []string{"half"}
			} else {
				term.Confidence = "incomplete_parent_records"
			}
		case adoptive > 0:
			term.Modifiers = []string{"adoptive"}
		case foster > 0:
			term.Modifiers = []string{"foster"}
		}
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
