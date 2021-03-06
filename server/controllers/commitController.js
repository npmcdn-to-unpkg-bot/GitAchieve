var request = require('request');
var db = require('../db/database.js').db;
var pgp = require('../db/database.js').pgp;
var token = require('../config/github.config').token;
var rp = require('request-promise');
var getRepoOwners = require('../helpers/getRepoOwners');




// GET at '/api/v1/users/:id/commits'
exports.retrieveCommits = function(req, res) {
  var queryId = req.params.id;
  db.any('SELECT * FROM $1~ ' +
    'WHERE $2~ = $3',
    ['commits', 'user_id', queryId])
    .then(commits => {
      sortedCommits = commits.sort((a, b) => {
        return (new Date(b.date) - new Date(a.date));
      });
      res.send(sortedCommits);
    })
    .catch(error => {
      console.error('Error querying commits: ', error);
      res.status(500).send();
    }); 
};


// PUT at '/api/v1/users/:id/commits' to update commits for a specific repo, useful when
// updating the current competition
// request body must include repoid to update
exports.updateCompetition = function(req, res) {
  
  var dbTimestamp = pgp.as.date(new Date());
  var queryId = req.params.id;
  var repoId = req.body.repoid;
  var repoCountUpdateCompetition = 0;
  var branchCount = 0;
  var branchTotal;
  
  // HELFPER FUNCTIONS 
  
  // will be called once for each branch to save commits and joins
  var saveCommitsAndJoinsUpdateCompetition = (queryId, commits, repoId, userId, branchSha, callback) => {
    // save commits to database, using SHA as unique id
    db.tx(t => {
      var queries = [];
      if (commits.length > 0) {
        queries = commits.map(commit => {
          if (!!commit.author) {
            return t.any('INSERT INTO $1~ AS $2~ ($3~, $4~, $5~, $6~, $7~, $13~) ' +
              'VALUES ($8, $9, $10, $11, $12, $14) ' +
              'ON CONFLICT ($3~) ' + 
              'DO UPDATE SET ($4~, $5~, $6~, $7~, $13~) = ($9, $10, $11, $12, $14) ' +
              'WHERE $2~.$3~ = $8 ' +
              'RETURNING *',
              ['commits', 'c', 'sha', 'updated_ga', 'date', 'user_id', 'commit_message',
              commit.sha, dbTimestamp, pgp.as.date(new Date(commit.commit.author.date)), 
              commit.author.id, commit.commit.message,
              'branch_sha', branchSha]);  
          }
        });
      }
      return t.batch(queries);
    })
    .then(data => {
      // save joins to database, associating each commit with a repo
      db.tx(t => {
        var queries = [];
        if (commits.length > 0) {
          queries = commits.map(commit => {
            // only add a join row if it doesn't exist already
            if (!!commit.author) {
              return t.any('INSERT INTO $1~ ($2~, $3~, $4~) ' +
                'SELECT $5, $6, $7 WHERE NOT EXISTS ' +
                '(SELECT * FROM $1~ WHERE $3~ = $6 AND $4~ = $7) ' +
                'RETURNING *',
                ['commits_repos', 'created_ga', 'repo_id', 'commit_sha',
                dbTimestamp, repoId, commit.sha]);
            }
          });
        }
        return t.batch(queries);
      }) 
      .then(data => {
        callback(queryId);
      })
      .catch(error => {
        console.error('Error adding joins **: ', error);
      }); 
    })
    .catch(error => {
      console.error('Error adding commits: ', error);
    }); 
  }; 
  
  // will be called once a branch is processed
  var sendUpdatedCommits = function (queryId) {
    branchCount++;
    // once all commits from all repos have been added,
    if (branchCount === branchTotal) {
      // query the database for this user's commits
      db.any('SELECT * FROM $1~ ' +
        'WHERE $2~ = $3',
        ['commits', 'user_id', queryId])
      .then(commits => {
        // update the commits_count in the user table
        db.one('INSERT INTO $1~ AS $2~ ($3~, $4~, $5~) ' +
          'VALUES ($6, $7, $8) ' +
          'ON CONFLICT ($3~) ' +
          'DO UPDATE SET ($4~) = ($7) ' +
          'WHERE $2~.$3~ = $6 ' +
          'RETURNING *',
          ['users', 'u', 'id', 'commits_count', 'created_ga',
          queryId, commits.length, dbTimestamp])
          .then((data) => {
            // send the server response
            res.send(commits);
          })
          .catch(error => {
            console.error('Error updating commits_count: ', error);
          });
      })
      .catch(error => {
        console.error('Error querying commits: ', error);
      }); 
    }
  };
  
  
  // business logic for PUT request - uses helper functions defined above
  
  // find the user
  db.one('SELECT * from $1~ ' +
    'WHERE $2~=$3',
    ['users', 'id', queryId])
    .then(user => {
      // find the repo
      db.one('SELECT * from $1~ ' +
        'WHERE $2~=$3',
        ['repos', 'id', repoId])
        .then(repo => {
          // find orgs for this repo, if there are any
          db.oneOrNone('SELECT * FROM $1~ ' +
            'WHERE $2~=$3',
            ['orgs', 'id', repo.owner_id])
            .then(org => {
              // set up a hash of the repo's ownership info
              var repoOwner;
              if (org !== null) {
                repoOwner = {
                  repoId: repo.id,
                  repoName: repo.name,
                  userName: user.username,
                  userId: user.id,
                  orgId: org.id,
                  orgName: org.orgname,
                  repoOwnerId: repo.owner_id
                };
              } else {
                repoOwner = {
                  repoId: repo.id,
                  repoName: repo.name,
                  userName: user.username,
                  userId: user.id,
                  orgId: null,
                  orgName: null,
                  repoOwnerId: repo.owner_id
                };
              }
              return repoOwner;
            })
            .then(repoOwner => {
              // once we have the repo ownership info, find the branches for this repo
              db.any('SELECT b.sha, b.updated_ga, b.name ' + 
                'FROM repos_branches rb ' +
                'INNER JOIN branches b ' +
                'ON b.sha = rb.branch_sha ' +
                'WHERE rb.repo_id =($1)', 
                repoId)
                .then(branches => {
                  var ownerName;
                  if (repoOwner.orgName === null) {
                    ownerName = repoOwner.userName;
                  } else {
                    ownerName = repoOwner.orgName;
                  }
                  branchTotal = branches.length;
                  // if there are no branches, send empty response
                  if (branchTotal === 0) {
                    res.send([]);
                  } else {
                    // if there are branches, continue processing each one
                    branches.forEach(branch => {
                      // configure a GitHub GET request get retrieve the commits for each branch of this repo
                      var options = {
                        uri: 'https://api.github.com/repos/' + ownerName + '/' + repoOwner.repoName + 
                        '/commits?sha=' + branch.name,
                        headers: {
                          'User-Agent': repoOwner.userName,
                          // Uncomment this line to make GET requests from within the site (not with Postman)
                          'Authorization': `token ${req.body.token}`
                          // Uncomment this line to make GET requests from Postman
                          // 'Authorization': 'token ' + token
                        },
                        json: true // Automatically parses the JSON string in the response 
                      };
                      // invoke the GET request
                      rp(options)
                        .then(commits => {
                          db.tx(t => {
                            // insert each commit's author as a user if they don't exist in users table
                            var queries = [];
                            if (commits.length > 0) { 
                              queries = commits.map(commit => {
                                if (!!commit.author) {
                                  return t.any('INSERT INTO $1~ as $2~ ($3~, $4~, $5~, $6~, $7~, $8~) ' +
                                    'VALUES ($9, $10, $11, $12, $13, $14) ' +
                                    'ON CONFLICT ($3~) ' +
                                    'DO NOTHING',
                                    ['users', 'u', 'id', 'created_ga', 'username', 'signed_up', 'email', 'avatar_url',
                                    commit.author.id, dbTimestamp, commit.author.login, false, commit.commit.author.email, commit.author.avatar_url]);
                                }
                              });
                            }
                            return t.batch(queries);
                          })
                          .then(data => {
                            saveCommitsAndJoinsUpdateCompetition(queryId, commits, repoOwner.repoId, repoOwner.userId, branch.sha, sendUpdatedCommits);
                          })
                          .catch(error => {
                            console.error('Error adding commit authors: ', error);
                          });
                        })
                      .catch(error => {
                        if (error.statusCode !== 500) {
                          console.log('Error in getCommitsFromGitHub - repo: "' + repoOwner.repoName + '"" for user: "' + repoOwner.userName + '"" not found in GitHub');
                          // if there is a non-500 error for a branch, count it toward the total
                          sendUpdatedCommits(queryId);
                        } else {
                          console.error('Error in GET from GitHub: ', error);
                        }
                      });
                    }); // end of branches.forEach
                  } // end of else case when branches.length !== 0
                  
                })
                .catch(error => {
                  console.error('Error selecting branches: ', error);
                });
            })  
            .catch(error => {
              console.error('Error selecting orgs: ');
              // res.status(500).send('Error selecting orgs');
            });
        })
        .catch(error => {
          console.error('Error selecting repo: ', error);
        });
    })
    .catch(error => {
      console.error('Error selecting user: ', error);
    });
  
};

// PATCH at '/api/v1/users/:id/commits'
exports.updateCommits = function(req, res) {
  var queryId = req.params.id;
  var dbTimestamp = pgp.as.date(new Date());
  var repoCountUpdateCommits = 0;
  
  // ** HELPER FUNCTIONS **
  
  // to be used once each commit's author has been added to the users table
  var saveCommitsAndJoins = (commits, repoId, totalRepos, userId, branchSha) => {
    // save commits to database, using SHA as unique id
    db.tx(t => {
      var queries = [];
      if (commits.length > 0) {
        queries = commits.map(commit => {
          if (!!commit.author) {
            return t.any('INSERT INTO $1~ AS $2~ ($3~, $4~, $5~, $6~, $7~, $13~) ' +
              'VALUES ($8, $9, $10, $11, $12, $14) ' +
              'ON CONFLICT ($3~) ' + 
              'DO UPDATE SET ($4~, $5~, $6~, $7~, $13~) = ($9, $10, $11, $12, $14) ' +
              'WHERE $2~.$3~ = $8',
              ['commits', 'c', 'sha', 'updated_ga', 'date', 'user_id', 'commit_message',
              commit.sha, dbTimestamp, pgp.as.date(new Date(commit.commit.author.date)), 
              commit.author.id, commit.commit.message,
              'branch_sha', branchSha]);  
          }
        });
      }
      return t.batch(queries);
    })
    .then(data => {
      // save joins to database, associating each commit with a repo
      db.tx(t => {
        var queries = [];
        if (commits.length > 0) {
          queries = commits.map(commit => {
            // only add a join row if it doesn't exist already
            if (!!commit.author) {
              return t.any('INSERT INTO $1~ ($2~, $3~, $4~) ' +
                'SELECT $5, $6, $7 WHERE NOT EXISTS ' +
                '(SELECT * FROM $1~ WHERE $3~ = $6 AND $4~ = $7)',
                ['commits_repos', 'created_ga', 'repo_id', 'commit_sha',
                dbTimestamp, repoId, commit.sha]);
            }
          });
        }
        return t.batch(queries);
      }) 
      .then(data => {
        repoCountUpdateCommits++;
        // once all commits from all repos have been added,
        if (repoCountUpdateCommits === totalRepos) {
          // query the database for this user's commits
          db.any('SELECT * FROM $1~ ' +
            'WHERE $2~ = $3',
            ['commits', 'user_id', userId])
          .then(commits => {
            // update the commits_count in the user table
            db.one('INSERT INTO $1~ AS $2~ ($3~, $4~, $5~) ' +
              'VALUES ($6, $7, $8) ' +
              'ON CONFLICT ($3~) ' +
              'DO UPDATE SET ($4~) = ($7) ' +
              'WHERE $2~.$3~ = $6 ' +
              'RETURNING *',
              ['users', 'u', 'id', 'commits_count', 'created_ga',
              queryId, commits.length, dbTimestamp])
              .then((data) => {
                // send the server response
                res.send(commits);
              })
              .catch(error => {
                console.error('Error updating commits_count: ', error);
              });
          })
          .catch(error => {
            console.error('Error querying commits: ', error);
          }); 
        }
      })
      .catch(error => {
        console.error('Error adding joins: ', error);
      }); 
    })
    .catch(error => {
      console.error('Error adding commits: ', error);
    }); 
  };            
  
  var getCommitsFromGitHub = (repoOwners) => {
    var totalRepos = repoOwners.length;
    var repoCountGetCommits = 0;
    
    repoOwners.forEach(repoOwner => { // START OF REPOOWNERS FOR EACH
      var ownerName;
      if (repoOwner.repoOwnerId === repoOwner.userId) {
        ownerName = repoOwner.userName;
      } else {
        ownerName = repoOwner.orgName;
      }
      
      // get the branches associated with this repo
      db.any('SELECT b.sha, b.updated_ga, b.name ' + 
        'FROM repos_branches rb ' +
        'INNER JOIN branches b ' +
        'ON b.sha = rb.branch_sha ' +
        'WHERE rb.repo_id =($1)', 
        repoOwner.repoId)
        .then(branches => {
          var totalBranches = branches.length;
          // if there are no branches, just increment the count
          if (totalBranches === 0) {
            repoCountGetCommits++;
          } else {
            // if there are branches, continue processing each one
            branches.forEach(branch => {
              // configure a GitHub GET request get retrieve the commits for each branch of this repo
              var options = {
                uri: 'https://api.github.com/repos/' + ownerName + '/' + repoOwner.repoName + 
                '/commits?sha=' + branch.name,
                headers: {
                  'User-Agent': repoOwner.userName,
                  // Uncomment this line to make GET requests from within the site (not with Postman)
                  'Authorization': `token ${req.body.token}`
                  // Uncomment this line to make GET requests from Postman
                  // 'Authorization': 'token ' + token
                },
                json: true // Automatically parses the JSON string in the response 
              };
              // invoke the GET request
              rp(options)
                .then(commits => {
                  db.tx(t => {
                    // insert each commit's author as a user if they don't exist in users table
                    var queries = [];
                    if (commits.length > 0) { 
                      queries = commits.map(commit => {
                        if (!!commit.author) {
                          return t.any('INSERT INTO $1~ as $2~ ($3~, $4~, $5~, $6~, $7~, $8~) ' +
                            'VALUES ($9, $10, $11, $12, $13, $14) ' +
                            'ON CONFLICT ($3~) ' +
                            'DO NOTHING',
                            ['users', 'u', 'id', 'created_ga', 'username', 'signed_up', 'email', 'avatar_url',
                            commit.author.id, dbTimestamp, commit.author.login, false, commit.commit.author.email, commit.author.avatar_url]);
                        }
                      });
                    }
                    return t.batch(queries);
                  })
                  .then(data => {
                    repoCountGetCommits++;
                    saveCommitsAndJoins(commits, repoOwner.repoId, totalRepos, repoOwner.userId, branch.sha);
                  })
                  .catch(error => {
                    console.error('Error adding commit authors: ', error);
                  });
                })
              .catch(error => {
                if (error.statusCode !== 500) {
                  repoCountGetCommits++;
                  console.log('Error in getCommitsFromGitHub - repo: "' + repoOwner.repoName + '"" for user: "' + repoOwner.userName + '"" not found in GitHub');
                  if (repoCountGetCommits === totalRepos) {
                    res.status(500).send('Error in getCommitsFromGitHub - repo: "' + repoOwner.repoName + '"" for user: "' + repoOwner.userName + '"" not found in GitHub');
                  }
                } else {
                  console.error('Error in GET from GitHub: ', error);
                }
              });
            }); // END OF BRANCHES FOREACH
          } 
        }) 
        .catch(error => {
          console.error('Error adding commit authors: ', error);
        });      
    }); // END OF REPOOWNERS FOREACH
      
  };
  
  // CALL HELPER FUNCTIONS
  console.log('in commitController, queryId', queryId);
  getRepoOwners(queryId, getCommitsFromGitHub);
  
};
