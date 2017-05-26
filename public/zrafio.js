
        function getRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min)) + min;
        }

        function hashPassword(password) {
            if (typeof password == 'undefined') {
                password = '';
            }
            var salt = getRandomInt(0, 100000000);
            var saltedPass = salt + '|' + md5(salt + '|' + password);
            return saltedPass;
        }

        function getJobIndex(jobs, jobId) {
            for (var i in jobs) {
                if (jobs[i].id == jobId) {
                    return i;
                }
            }
            return -1;
        }

        var oldLength = 0;
        var oldText = '';

        $(function() {
            //$('#loginmodal').modal({'show': true, 'keyboard': false });
            $('#loginmodal').on('shown.bs.modal', function(e) {
                $('#passwordinput').focus();
            });
            $('#loginmodal').on('hidden.bs.modal', function(e) {
                //$('#cmdinput').focus();
            });
            $('#resultsmodal').on('hidden.bs.modal', function(e) {
                //$('#cmdinput').focus();
            });
            $('#submitmodal').on('shown.bs.modal', function(e) {
                $('#cmdinput').focus();
            });
            $('#submitmodal').on('hidden.bs.modal', function(e) {
                //$('#showLaunchButton').focus();
            });
            $('#cmdinput').keyup(function(e) {
                if (e.keyCode == 27) {
                    $('#cmdinput').val('');
                }
            });
            $(document).keydown(function(e) {
                if (e.keyCode == 27) {
                    e.preventDefault();
                }
                if (e.key == 'r') {
                    if (!$('#submitmodal').hasClass('in')) {
                        $('#cmdinput').val('');
                        $('#submitmodal').modal('show');
                    } // else, ignore
                }
            });
            //$('#submitmodal').modal('show');
        });

        var app = angular.module('mainapp', ['ngResource', 'ngStorage']);
        var intervalId = null;
        app.controller('maincontroller', function($scope, $http, $resource, $sessionStorage) {
            var Job = $resource('/api/jobs/:id', {
                id: '@id'
            });
            $scope.myiframedisplay = 'none';
            $scope.getConfig = function() {
                $http.get('/api/config').success(function(config) {
                    $scope.config = config;
                }).error(function(error) {
                    console.log('failed to get config', error.status, error.data);
                    //alert('Server not available, or password was not recognized.');
                });
            }
            $scope.refreshJobs = function() {
                Job.query().$promise.then(function(jobs) {
                    $scope.jobs = jobs;
                    $('#loginmodal').modal('hide');
                    $sessionStorage.password = $scope.password;
                }).catch(function(error) {
                    if (error.status == 401) {
                        if ($('#loginmodal').hasClass('in')) {
                            alert('Password was not recognized.');
                        }
                        $('#loginmodal').modal('show');
                        $('#passwordinput').focus();
                    } else {
                        console.log('Server not available.', error.status, error.data);
                    }
                });
            }
            $scope.launch = function() {
                if (typeof $scope.cmd == 'undefined' || $scope.cmd == '') {
                    alert('Please provide a command, and try again');
                    return;
                }
                var stringToCheck = ($scope.password || '') + '||' + $scope.dir + '||' + $scope.cmd;
                var checksum = md5(stringToCheck);

                $http.defaults.headers.common['Auth-Token'] = checksum;
                var job = new Job({
                    'dir': $scope.dir,
                    'cmd': $scope.cmd
                });
                job.$save().then(function(job) {
                    console.log('jobs post result', job);
                    $scope.jobs.push(job);
                    $scope.tail(job);
                }).catch(function(error) {
                    console.log('failed to post job', error.status, error.data);
                });
                $scope.updateAuthToken();
            }
            $scope.tail = function(job) {
                oldText = '';
                $('#myiframe').contents().html('');
                $('#outputdiv').html('');
                console.log('tailing:', job);
                $scope.modalresultstitle = job.cmd
                $('#myiframe').attr('src', '/api/jobs/' + job.id + '/results?checkpass=' + hashPassword($scope.password) + '&nocompress=1');
                $('#resultsmodal').modal('show');
            }
            $scope.copyArgs = function(job) {
                console.log('copyargs ', job);
                $scope.dir = job.dir;
                $scope.cmd = job.cmd;
                $('#dirinput').val(job.dir);
                $('#cmdinput').val(job.cmd);
                $('#submitmodal').modal('show');
            }
            $scope.remove = function(job) {
                job.$delete().then(function(data) {
                    var index = getJobIndex($scope.jobs, job.id);
                    $scope.jobs.splice(index, 1);
                    console.log('delete succeed ', data);
                }).catch(function(error) {
                    console.log('delete fail ', result.status, result.data);
                });
            }
            $scope.kill = function(job) {
                if (job.state != 'running') {
                    alert('Can only kill running jobs');
                    return;
                }
                var updatedJob = angular.copy(job);
                updatedJob.state = 'done';
                updatedJob.$save().then(function(data) {
                    console.log('kill success');
                    job.done = true;
                    job.state = 'done';
                    $scope.refreshJobs();
                }).catch(function(error) {
                    console.log('kill fail ', error.status, error.data);
                });
            }
            $scope.refreshOutput = function() {
                console.log('$scope.refreshOutput()');
                var newText = $('#myiframe').contents().text();
                if (newText == oldText) {
                    console.log('refreshoutput: no change => exiting');
                    $scope.checkJobs();
                    return;
                }
                $('#outputdiv').html(newText.replace(/  /g, ' &nbsp;').replace(/\n/g, '<br />\n'));
                oldLength = newText.length;
                oldText = newText;
                //  console.log('exiting refreshoutput');
                $scope.refreshJobs();
            }
            $scope.checkJobs = function() {
                var jobInProgress = false;
                for (var i in $scope.jobs) {
                    if (!$scope.jobs[i].done) {
                        jobInProgress = true;
                    }
                }
                if (jobInProgress) {
                    $scope.refreshJobs();
                }
            };
            $scope.doLogin = function() {
                console.log('$scope.doLogin()');
                $scope.getConfig();
                $scope.refreshJobs();
            }
            $scope.updateAuthToken = function() {
                var newToken = hashPassword($scope.password);
                console.log('updating auth token to ' + newToken);
                $http.defaults.headers.common['Auth-Token'] = newToken;
            }
            $('#myiframe').load(function(event) {
                console.log('iframe load start');
                $scope.refreshOutput();
                $scope.checkJobs();
            });
            intervalId = window.setInterval(function() {
                $scope.refreshOutput();
            }, 3000);

            $scope.showLaunch = function() {
                $('#submitmodal').modal('show');
                // $('#cmdinput').focus();
            };
            if (typeof $sessionStorage.password != 'undefined') {
                $scope.password = $sessionStorage.password;
                // $scope.updateAuthToken();
            }
            $scope.updateAuthToken();
            $scope.refreshJobs();
            /*$( function() {
                $('#loginmodal').modal('hide');
                $scope.showLaunch();
            });*/
            $scope.logout = function() {
                delete $sessionStorage.password;
                $scope.password = '';
                $scope.updateAuthToken();
                $('#loginmodal').modal('show');
            };
        });
