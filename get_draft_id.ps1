$env:GH_TOKEN = "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"
gh api graphql -f query='
query {
  repository(owner: "emirateswebfusion", name: "nafid-pos") {
    releases(first: 10) {
      nodes {
        id
        name
        tagName
        isDraft
        createdAt
      }
    }
  }
}
'