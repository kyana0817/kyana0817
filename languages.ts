const EXCLUDED_LANGUAGES = new Set(['HTML', 'CSS', 'SCSS']);

const GITHUB_GRAPHQL_QUERY = `
  query($cursor: String) {
    viewer {
      repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, isFork: false) {
        nodes {
          languages(first: 10) {
            edges {
              size
              node {
                name
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

type GitHubRepository = {
  name: string;
  languages: {
    edges: Array<{
      size: number;
      node: {
        name: string;
      };
    }>;
  };
};

type GitHubGraphQLResponse = {
  data: {
    viewer: {
      repositories: {
        nodes: Array<GitHubRepository>;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    };
  };
};

type LanguageData = {
  language: string;
  bytes: number;
  percentage: number;
};

async function fetchRepositories(
  token: string,
  cursor: string | null
): Promise<GitHubGraphQLResponse> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'kyana0817:profile-app',
    },
    body: JSON.stringify({
      query: GITHUB_GRAPHQL_QUERY,
      variables: { cursor }
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub GraphQL API responded with status ${res.status}`);
  }

  return await res.json() as GitHubGraphQLResponse;
}

/**
 * リポジトリから言語データを集計
 */
function aggregateLanguageData(repos: Array<GitHubRepository>): Record<string, number> {
  const languageData: Record<string, number> = {};

  for (const repo of repos) {
    for (const edge of repo.languages.edges) {
      const language = edge.node.name;
      const bytes = edge.size;

      if (!EXCLUDED_LANGUAGES.has(language)) {
        languageData[language] = (languageData[language] || 0) + bytes;
      }
    }
  }

  return languageData;
}

async function fetchAllLanguageData(token: string): Promise<{ languageData: Record<string, number>; totalRepos: number }> {
  let allLanguageData: Record<string, number> = {};
  let hasNextPage = true;
  let cursor: string | null = null;
  let totalRepos = 0;

  while (hasNextPage) {
    const data = await fetchRepositories(token, cursor);
    const repos = data.data.viewer.repositories.nodes;
    totalRepos += repos.length;

    const repoLanguageData = aggregateLanguageData(repos);
    for (const [language, bytes] of Object.entries(repoLanguageData)) {
      allLanguageData[language] = (allLanguageData[language] || 0) + bytes;
    }

    hasNextPage = data.data.viewer.repositories.pageInfo.hasNextPage;
    cursor = data.data.viewer.repositories.pageInfo.endCursor;
  }

  return { languageData: allLanguageData, totalRepos };
}

function calculateLanguagePercentages(languageData: Record<string, number>): Array<LanguageData> {
  const totalBytes = Object.values(languageData).reduce((sum, bytes) => sum + bytes, 0);
  const result: Array<LanguageData> = [];

  for (const [language, bytes] of Object.entries(languageData)) {
    const percentage = (bytes / totalBytes * 100);
    result.push({ language, bytes, percentage });
  }

  result.sort((a, b) => b.percentage - a.percentage);
  return result.slice(0, 10);
}

function generateSvgHeader(svgWidth: number, svgHeight: number, totalRepos: number): string[] {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">`,
    `  <defs>`,
    `    <style>`,
    `      .terminal-text { font-family: 'Monaco', 'Menlo', 'Courier New', monospace; }`,
    `      .prompt { fill: #50fa7b; }`,
    `      .command { fill: #8be9fd; }`,
    `      .output { fill: #f8f8f2; }`,
    `      .percentage { fill: #ffb86c; }`,
    `      .bar-bg { fill: #44475a; }`,
    `      .bar-fill { fill: #50fa7b; }`,
    `    </style>`,
    `  </defs>`,
    `  `,
    `  <rect width="${svgWidth}" height="${svgHeight}" fill="#282a36" rx="8"/>`,
    `  `,
    `  <rect width="${svgWidth}" height="40" fill="#21222c" rx="8"/>`,
    `  <rect width="${svgWidth}" height="40" fill="#21222c"/>`,
    `  <circle cx="20" cy="20" r="6" fill="#ff5555"/>`,
    `  <circle cx="40" cy="20" r="6" fill="#ffb86c"/>`,
    `  <circle cx="60" cy="20" r="6" fill="#50fa7b"/>`,
    `  <text x="300" y="26" class="terminal-text output" font-size="14" text-anchor="middle" opacity="0.8">`,
    `    kyana0817@github ~ language-stats`,
    `  </text>`,
    `  `,
    `  <text x="20" y="70" class="terminal-text prompt" font-size="16" font-weight="bold">`,
    `    $`,
    `  </text>`,
    `  <text x="35" y="70" class="terminal-text command" font-size="16">`,
    `    analyze --repos=${totalRepos}`,
    `  </text>`,
    `  `,
    `  <text x="20" y="100" class="terminal-text output" font-size="14" opacity="0.7">`,
    `    Analyzing ${totalRepos} repositories...`,
    `  </text>`,
    `  `,
    `  <line x1="20" y1="115" x2="580" y2="115" stroke="#44475a" stroke-width="1"/>`,
  ];
}

function generateLanguageBars(topLanguages: Array<LanguageData>): string[] {
  const bars: string[] = [];
  const barMaxWidth = 350;

  topLanguages.forEach((item, index) => {
    const y = 145 + index * 35;
    const barWidth = (item.percentage / 100) * barMaxWidth;

    bars.push(
      ``,
      `  <text x="20" y="${y}" class="terminal-text output" font-size="15">`,
      `    ${item.language.padEnd(15, ' ')}`,
      `  </text>`,
      `  `,
      `  <rect x="200" y="${y - 12}" width="${barMaxWidth}" height="16" class="bar-bg" rx="2"/>`,
      `  <rect x="200" y="${y - 12}" width="${barWidth}" height="16" class="bar-fill" rx="2"/>`,
      `  `,
      `  <text x="565" y="${y}" class="terminal-text percentage" font-size="15" text-anchor="end" font-weight="bold">`,
      `    ${item.percentage.toFixed(1)}%`,
      `  </text>`
    );
  });

  return bars;
}

function generateSvgFooter(svgHeight: number): string[] {
  return [
    ``,
    `  `,
    `  <text x="20" y="${svgHeight - 20}" class="terminal-text prompt" font-size="14">`,
    `    $`,
    `  </text>`,
    `  <text x="35" y="${svgHeight - 20}" class="terminal-text output" font-size="14" opacity="0.5">`,
    `    █`,
    `  </text>`,
    `</svg>`
  ];
}

function generateSvgContent(topLanguages: Array<LanguageData>, totalRepos: number): string {
  const svgWidth = 600;
  const svgHeight = 180 + topLanguages.length * 35;

  const svgParts = [
    ...generateSvgHeader(svgWidth, svgHeight, totalRepos),
    ...generateLanguageBars(topLanguages),
    ...generateSvgFooter(svgHeight)
  ];

  return svgParts.join('\n');
}

export const createSvg = async (): Promise<string> => {
  try {
    // GitHubから全リポジトリの言語データを取得
    const { languageData, totalRepos } = await fetchAllLanguageData(process.env.GH_TOKEN as string);
    
    // トップ10の言語を計算
    const topLanguages = calculateLanguagePercentages(languageData);
    
    // SVGコンテンツを生成
    const svgContent = generateSvgContent(topLanguages, totalRepos);
    
    return svgContent;
  } catch (error) {
    console.error('Error generating SVG:', error);
    throw error;
  }
};

(async () => {
  const svg = await createSvg();
  const fs = await import('fs');
  // distにSVGを書き出す
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
  }
  fs.writeFileSync('dist/language-stats.svg', svg);
  console.log('SVG generated successfully');
})()

