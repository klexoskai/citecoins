import { useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMockTopic, getMockArticlesByTopic } from "@/lib/mockContent";
import { addTopicStake, getTopicStake } from "@/lib/mockStakes";
import { addArticleStake, getArticleStake } from "@/lib/mockArticleStakes";

export default function TopicPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const topic = getMockTopic(id);
  const [staked, setStaked] = useState(() => (id ? getTopicStake(id) : 0));
  const [topicStakeInput, setTopicStakeInput] = useState("");
  const [articleStakes, setArticleStakes] = useState<Record<string, { total: number; mine: number }>>({});
  const [articleStakeInputs, setArticleStakeInputs] = useState<Record<string, string>>({});

  if (!topic) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-1 h-8">
            <ArrowLeft size={14} />
            Back
          </Button>
        </Link>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Topic not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  const articles = getMockArticlesByTopic(topic.id);
  const readStake = (articleId: string) =>
    articleStakes[articleId] ?? getArticleStake(articleId);

  return (
    <div className="max-w-5xl mx-auto space-y-6" data-testid="topic-preview-page">
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-1 h-8">
            <ArrowLeft size={14} />
            Feed
          </Button>
        </Link>
      </div>

      <Card>
        <div className="aspect-[16/7] w-full overflow-hidden rounded-t-lg border-b border-border">
          <img src={topic.imageUrl} alt={topic.title} className="h-full w-full object-cover" />
        </div>
        <CardHeader>
          <CardTitle className="font-serif text-xl font-normal">{topic.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{topic.description}</p>
          <div className="flex items-center gap-3 pt-1">
            <p className="text-sm">
              <span className="text-primary font-semibold">{staked.toLocaleString()} CITE</span>{" "}
              staked in this bucket
            </p>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              className="h-8 w-24 rounded-md border border-border bg-background px-2 text-sm"
              value={topicStakeInput}
              onChange={(e) => setTopicStakeInput(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() => {
                const amount = Number(topicStakeInput);
                if (!Number.isFinite(amount) || amount <= 0) return;
                const next = addTopicStake(topic.id, amount);
                setStaked(next);
                setTopicStakeInput("");
              }}
            >
              Stake
            </Button>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {topic.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {articles.map((article) => (
          <Card key={article.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">{article.title}</CardTitle>
              <p className="text-xs text-muted-foreground">By {article.author}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{article.excerpt}</p>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  <div>
                    You staked:{" "}
                    <span className="font-medium text-foreground">
                      {readStake(article.id).mine.toLocaleString()} CITE
                    </span>
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount"
                  className="h-8 w-28 rounded-md border border-border bg-background px-2 text-sm"
                  value={articleStakeInputs[article.id] ?? ""}
                  onChange={(e) =>
                    setArticleStakeInputs((prev) => ({ ...prev, [article.id]: e.target.value }))
                  }
                />
                <Button
                  size="sm"
                  onClick={() => {
                    const amount = Number(articleStakeInputs[article.id] ?? "");
                    if (!Number.isFinite(amount) || amount <= 0) return;
                    const next = addArticleStake(article.id, amount);
                    setArticleStakes((prev) => ({ ...prev, [article.id]: next }));
                    setArticleStakeInputs((prev) => ({ ...prev, [article.id]: "" }));
                  }}
                >
                  Stake
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
