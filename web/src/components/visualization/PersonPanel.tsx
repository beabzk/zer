import { type Individual } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { type EdgeMode } from "../forms/EdgeModal";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "../ui";

interface Props {
  locale: Locale;
  person: Individual;
  onEdit: () => void;
  onEdge: (mode: EdgeMode) => void;
  onFocus: () => void;
}

export function PersonPanel({ locale, person, onEdit, onEdge, onFocus }: Props) {
  const anchor = {
    id: person.id,
    full_native: person.full_native,
    full_latin: person.full_latin,
    gender: person.gender,
  };
  return (
    <Card className="h-fit xl:sticky xl:top-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{person.full_latin}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{person.full_native}</p>
          </div>
          <Badge variant={person.is_deceased ? "neutral" : "success"}>
            {person.is_deceased ? t(locale, "person.deceased") : t(locale, "person.living")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="rounded-md bg-panel-muted px-3 py-3 text-sm text-muted-foreground">
          {person.birth_date_gc ? `${t(locale, "person.birth")}: ${person.birth_date_gc}` : t(locale, "person.noBirthDate")}
        </div>
        <Button onClick={onEdit}>{t(locale, "person.edit")}</Button>
        <Button variant="outline" onClick={onFocus}>{t(locale, "canvas.focus")}</Button>
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" onClick={() => onEdge({ kind: "parent", child: anchor })}>
            {t(locale, "edge.addParent")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEdge({ kind: "child", parent: anchor })}>
            {t(locale, "edge.addChild")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEdge({ kind: "union", partner: anchor })}>
            {t(locale, "edge.addUnion")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
