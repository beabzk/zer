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

type KinshipTermComposition struct {
	Role        string   `json:"role"`
	Key         string   `json:"key"`
	Gender      string   `json:"gender"`
	Modifiers   []string `json:"modifiers,omitempty"`
	UnionStatus string   `json:"union_status,omitempty"`
}

type KinshipTerm struct {
	Perspective string                   `json:"perspective"`
	Key         string                   `json:"key"`
	Gender      string                   `json:"gender"`
	Modifiers   []string                 `json:"modifiers,omitempty"`
	Parameters  KinshipTermParameters    `json:"parameters"`
	Confidence  string                   `json:"confidence"`
	Composition []KinshipTermComposition `json:"composition,omitempty"`
}

type kinshipParent struct {
	ID               string
	RelationshipType string
}

type kinshipUnion struct {
	Type   string
	Status string
}

type kinshipFacts struct {
	targetGender    string
	parentsA        []kinshipParent
	parentsB        []kinshipParent
	parentsByPerson map[string][]kinshipParent
	people          map[string]KinshipPerson
	parentUnion     *kinshipUnion
}

func classifyKinshipTerm(path []KinshipSegment, facts kinshipFacts) KinshipTerm {
	if !containsRelation(path, RelationSpouse) {
		return classifyBloodPath(path, facts, pathStartID(path), pathEndID(path))
	}

	term := KinshipTerm{
		Perspective: "a_to_b",
		Gender:      facts.targetGender,
		Confidence:  "exact",
	}
	if len(path) == 1 && path[0].Relation == RelationSpouse {
		term.Key = "spouse"
		return term
	}
	if len(path) == 3 && path[0].Relation == RelationParent &&
		path[1].Relation == RelationSpouse && path[2].Relation == RelationChild &&
		classifySibling(&term, facts.parentsA, facts.parentsB, facts.parentUnion) {
		return term
	}
	if classifyStepAunt(&term, path) {
		return term
	}
	if classifyDirectAffinal(&term, path, facts) {
		return term
	}
	if classifyCompoundAffinal(&term, path, facts) {
		return term
	}

	term.Key = "related"
	return term
}

func classifyBloodPath(
	path []KinshipSegment,
	facts kinshipFacts,
	startID string,
	targetID string,
) KinshipTerm {
	targetGender := facts.targetGender
	if person, ok := facts.people[targetID]; ok {
		targetGender = person.Gender
	}
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
	if classifySibling(
		&term, facts.parentsByPerson[startID], facts.parentsByPerson[targetID], nil,
	) {
		return term
	}
	if classifyParentChildCollateral(&term, path, facts.parentsByPerson) {
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

func classifyDirectAffinal(
	term *KinshipTerm,
	path []KinshipSegment,
	facts kinshipFacts,
) bool {
	spouseIndexes := relationIndexes(path, RelationSpouse)
	if len(spouseIndexes) != 1 {
		return false
	}
	spouseIndex := spouseIndexes[0]
	if spouseIndex != 0 && spouseIndex != len(path)-1 {
		return false
	}

	var bloodPath []KinshipSegment
	var bloodStartID string
	var bloodTargetID string
	if spouseIndex == 0 {
		bloodPath = path[1:]
		bloodStartID = path[0].ToID
		bloodTargetID = pathEndID(bloodPath)
	} else {
		bloodPath = path[:len(path)-1]
		bloodStartID = pathStartID(bloodPath)
		bloodTargetID = pathEndID(bloodPath)
	}
	blood := classifyBloodPath(bloodPath, facts, bloodStartID, bloodTargetID)

	affinalKey, ok := directAffinalKey(blood.Key)
	if !ok {
		return false
	}
	term.Key = affinalKey
	term.Gender = facts.targetGender
	term.Modifiers = blood.Modifiers
	term.Parameters = blood.Parameters
	if blood.Key == "aunt_uncle" || blood.Key == "niece_nephew" {
		term.Modifiers = append(term.Modifiers, "by_marriage")
	}
	if path[spouseIndex].UnionStatus == "DISSOLVED" {
		term.Modifiers = append(term.Modifiers, "former")
	}
	term.Parameters.UnionStatus = path[spouseIndex].UnionStatus
	return true
}

func directAffinalKey(bloodKey string) (string, bool) {
	switch bloodKey {
	case "parent":
		return "parent_in_law", true
	case "child", "descendant":
		return "child_in_law", true
	case "sibling":
		return "sibling_in_law", true
	case "cousin":
		return "cousin_in_law", true
	case "aunt_uncle", "niece_nephew":
		return bloodKey, true
	default:
		return "", false
	}
}

func classifyCompoundAffinal(
	term *KinshipTerm,
	path []KinshipSegment,
	facts kinshipFacts,
) bool {
	var bloodRuns [][]KinshipSegment
	var spouseSegments []KinshipSegment
	runStart := 0
	for index, segment := range path {
		if segment.Relation != RelationSpouse {
			continue
		}
		bloodRuns = append(bloodRuns, path[runStart:index])
		spouseSegments = append(spouseSegments, segment)
		runStart = index + 1
	}
	bloodRuns = append(bloodRuns, path[runStart:])
	if len(bloodRuns) < 2 || len(spouseSegments) == 0 {
		return false
	}

	anchorPath := bloodRuns[0]
	anchorStart := pathStartID(anchorPath)
	anchorEnd := pathEndID(anchorPath)
	anchor := classifyBloodPath(anchorPath, facts, anchorStart, anchorEnd)
	if anchor.Key == "related" {
		return false
	}

	composition := []KinshipTermComposition{compositionPart("anchor", anchor, facts, anchorEnd)}
	for index, spouse := range spouseSegments {
		spousePerson, ok := facts.people[spouse.ToID]
		if !ok {
			return false
		}
		composition = append(composition, KinshipTermComposition{
			Role:        "spouse",
			Key:         "spouse",
			Gender:      spousePerson.Gender,
			UnionStatus: spouse.UnionStatus,
		})

		relativePath := bloodRuns[index+1]
		relativeStart := pathStartID(relativePath)
		relativeEnd := pathEndID(relativePath)
		relative := classifyBloodPath(relativePath, facts, relativeStart, relativeEnd)
		if relative.Key == "related" {
			return false
		}
		composition = append(composition, compositionPart("relative", relative, facts, relativeEnd))
	}

	term.Key = "composed"
	term.Gender = facts.targetGender
	term.Parameters.UnionStatus = spouseSegments[0].UnionStatus
	term.Composition = composition
	return true
}

func compositionPart(
	role string,
	term KinshipTerm,
	facts kinshipFacts,
	personID string,
) KinshipTermComposition {
	gender := term.Gender
	if person, ok := facts.people[personID]; ok {
		gender = person.Gender
	}
	return KinshipTermComposition{
		Role:      role,
		Key:       term.Key,
		Gender:    gender,
		Modifiers: term.Modifiers,
	}
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
		if biological >= 2 ||
			(fullWhenKnownSetsMatch && len(parentsA) > 1 && sameParentIDs(parentsA, parentsB)) {
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
	for index := up; index < len(path); index++ {
		if path[index].Relation != RelationChild {
			return 0, 0, false
		}
		down++
	}
	return up, down, true
}

func pathStartID(path []KinshipSegment) string {
	if len(path) == 0 {
		return ""
	}
	return path[0].FromID
}

func pathEndID(path []KinshipSegment) string {
	if len(path) == 0 {
		return ""
	}
	return path[len(path)-1].ToID
}

func pathNodeID(path []KinshipSegment, index int) string {
	if index == 0 {
		return path[0].FromID
	}
	return path[index-1].ToID
}

func containsRelation(path []KinshipSegment, relation string) bool {
	for _, segment := range path {
		if segment.Relation == relation {
			return true
		}
	}
	return false
}

func relationIndexes(path []KinshipSegment, relation string) []int {
	var indexes []int
	for index, segment := range path {
		if segment.Relation == relation {
			indexes = append(indexes, index)
		}
	}
	return indexes
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
