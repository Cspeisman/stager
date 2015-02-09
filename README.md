# Stager

[GitHub pages] is a free service for compiling and serving static sites.

This thing does exactly what github pages does except for _all_ your project's branches, not just `master` or `gh-pages`. So it's useful for staging changes.

The downside is that you have to host this yourself and it only works on Heroku right now. Assuming the dyno doesn't see much traffic - a reasonable assumption for a staging server - it shouldn't cost you anything but right now it's a technical pain in the ass to set one up.

Godspeed.

### Preinstall - Jekyll

Your site's `_config.yml` needs this option set

    exclude: ["/vendor"]

### Preinstall - DNS:

1. Create a heroku app (from the web interface) and give it a good name,
   for example `myorg-blog-stager.herokuapp.com`
2. Create a CNAME DNS record named after the site you want to stage but with "branch" prefixed -
   for example, to stage branches of `blog.myorg.com` create a `branch.blog.myorg.com` record -
   and point it to the domain of the heroku app you just created
   (`myorg-blog-stager.herokuapp.com`).
3. Create a corresponding _wildcard_ CNAME record - like `*.branch.blog.myorg.com` - and also
   point it to the heroku app's domain

If you did this part correctly then visiting `branch.blog.myorg.com` and
`test.branch.blog.myorg.com` should both take you to a page that says something like
"Heroku | Welcome to your new app!". If they _don't_ then following the rest of the instructions
_won't help_. DNS resolution and configuration is finicky, fiddly and sometimes just plain crap.
This is not the internet we may have wanted but it is the internet we deserve. Keep fiddling,
restart your router or something. You can't skip this part.

### Preinstall - Security:

You'll need a github access token that you're comfortable shoving into a heroku environment
variable and leaving around on disk. I recommend creating one this way:

1. Open an incognito browser window, go to github and signup for an account ending in `-bot`
   (for "robot"). For example `myorg-bot`
2. From your regular account - in a normal browser window - add that bot as a collaborator to the
   target github pages project. If the project belongs to an org, then create a "robots" team, add
   the robot to it, then add the team to project.
3. Now go back to the incognito window, go to "settings", then "applications" then create a
   "personal access token" and name it something like `myorg-blog-stager`. Turn off all
   permissions except "repo"
4. Copy that token into `config.sh`

### Install:

Copy `config.sh.example` to `config.sh`, fill it out, then run:

    ./bin/deploy

If there were no errors reported then visit either `http://master.{{your domain}}` or
`http://gh-pages.{{your domain}}` (depending on how your site is configured on GitHub) to check that it worked. Other branches should also work.

### Post install:

In your github project, got to "Settings" then "Webhooks & Services" and add
`{{your domain}}/_update` as a "Payload URL". No secret is required and listening for just the
push event is fine.

---

## Local Development

On Yosemite, you need to install the latest dev version of local-tld, which can be done with:

    npm install -g git+https://github.com/hoodiehq/local-tld

Then run `./bin/dev-server`

---

Notes:

- the implementation is a combination of ancient wisdom and modern drama: bash, node & ruby
- two core pieces
  - the `update` shell program which
    - clones the site repo to local disk
    - builds every branch with jekyll and then makes a branch from that build
    - cleans up old build branches when the branch is deleted on github
    - leaves the repo's working copy empty to save memory
  - the `server.js` node program which
    - parses a branch name and file path from the hostname and url path
    - servers that branch+path from the git object db if it exists
    - does this all with streams so it should be light on memory an relatively quick
- the heroku cedar stack has a writable fs, which makes this possible, but
  disk usage counts as ram usage so this program optimizes for low disk usage
- it does this by not leaving a "working copy" of the jekyll site around on disk,
  everything is served straight from the git object database
- this means that even if your site is 400mb decompressed, and your heroku
  dyno only has 512mb of memory, you can *still* serve twenty branches from
  a single dyno thanks to immutability, content addressable storage, and
  efficient compression
- this architecture trades longer response times for decreased disk space, which seems like
  the right trade-off for a staging server
