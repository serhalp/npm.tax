import { createFileRoute } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";

import SupplyChainRisk from "../components/SupplyChainRisk";
import { GitHubIcon } from "../components/icons";
import { getRiskScenario, getScenarioDescription, getScenarioTitle } from "../lib/riskModel";
import { buildRiskScenarioUrls, parseRiskSearchRecord } from "../lib/riskSearch";

const currentUrl = createIsomorphicFn()
  .client(() => new URL(window.location.href))
  .server(async () => {
    const { getRequestUrl } = await import("@tanstack/react-start/server");
    return getRequestUrl({ xForwardedHost: true, xForwardedProto: true });
  });

export const Route = createFileRoute("/")({
  validateSearch: parseRiskSearchRecord,
  head: async ({ match }) => {
    const scenario = getRiskScenario(match.search);
    const title = getScenarioTitle(scenario);
    const description = getScenarioDescription(scenario);
    const { pageUrl, ogImageUrl } = buildRiskScenarioUrls(match.search, await currentUrl());

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: pageUrl },
        { property: "og:image", content: ogImageUrl },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImageUrl },
      ],
    };
  },
  component: Home,
});

function Home() {
  return (
    <main className="min-h-screen bg-paper px-4 py-6 text-ink sm:px-6 lg:py-10">
      <SupplyChainRisk />
      <footer className="mx-auto mt-4 flex max-w-7xl items-center justify-between gap-4 border-t border-rule pt-5 text-sm leading-6 text-muted">
        <p>
          No affiliation or endorsement by npm, Inc. Made by{" "}
          <a
            href="https://philippeserhal.com/"
            className="font-medium text-ink underline decoration-rule-strong underline-offset-2 transition-colors hover:decoration-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Philippe Serhal
          </a>{" "}
          with a grain of salt bigger than your node_modules.
        </p>
        <a
          href="https://github.com/serhalp/npm.tax"
          aria-label="View npm.tax on GitHub"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <GitHubIcon />
        </a>
      </footer>
    </main>
  );
}
