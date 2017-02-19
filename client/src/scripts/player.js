const Vue = require('vue');
const VueResource = require('vue-resource');
const io = require('socket.io-client');
const QRious = require('qrious');

Vue.use(VueResource);

class PlayerPage {
  static init() {
    this.knobRate = 1; // Time in seconds to move when the knob turns
    this.doubleTapDelay = 300; // Time in ms to consider a double tap

    // Get the list of videos
    Vue.resource('/videos')
      .get()
      .catch(() => window.alert('Couldn\'t load data. Is the database server running?'))
      .then((res) => {
        const videos = res.body;
        this._buildApp(videos);
        this._getUpdates(videos);
        this.nextVideo();
      });
  }

  static _buildApp(videos) {
    this.app = new Vue({
      el: '#app',

      data: {
        selectedVideo: {},
        videos,
        progress: 0,
        showInfo: false,
        playSound: false,
        controllerConnected: false,
        controllerBattery: 0,
      },

      watch: {
        selectedVideo(newValue) {
          newValue.played = true;
        },
      },

      methods: {
        onProgressChanged(progress) {
          this.progress = progress;
        },

        onPlayModeChanged() {
          if (!this.showInfo && !this.playSound) {
            this.showInfo = true;
          } else if (this.showInfo && !this.playSound) {
            this.playSound = true;
          } else if (this.showInfo && this.playSound) {
            this.showInfo = false;
          } else if (!this.showInfo && this.playSound) {
            this.playSound = false;
          }
        },
      },

      components: {

        'video-player': {
          props: ['video', 'playSound'],
          methods: {

            // Set the volume on start.
            onLoadStart() {
              const videoNode = this.$el.getElementsByTagName('video')[0];
              videoNode.volume = this.playSound ? 1 : 0;
            },

            // Update the progress bar.
            onTimeUpdate() {
              const videoNode = this.$el.getElementsByTagName('video')[0];
              this.$emit('progress-changed', videoNode.currentTime / videoNode.duration);
            },

            onEnded() {
              PlayerPage.nextVideo();
            },
          },

          watch: {
            playSound(newValue) {
              const videoNode = this.$el.getElementsByTagName('video')[0];
              videoNode.volume = newValue ? 1 : 0;
            },
          },
        },

        'video-info': {
          props: ['video', 'showInfo'],
          computed: {
            qrcode() {
              return this.video.url ? new QRious({ value: this.video.url }).toDataURL() : '';
            },
          },
        },

        'video-progress': {
          props: ['progress'],
        },

        'controller-status': {
          props: ['connected', 'battery'],
        },

        'click-target': {
          mounted() {
            document.getElementById('click-target').focus();
          },

          methods: {
            onKeyPress() {
              this.$emit('play-mode-changed');
            },

            onPointerUp() {
              if (this.$tapTimeout) {
                // Double tap, go to next video
                clearTimeout(this.$tapTimeout);
                this.$tapTimeout = null;
                PlayerPage.nextVideo();
              } else {
                this.$tapTimeout = setTimeout(() => {
                  // Single tap, toggle info
                  this.$tapTimeout = null;
                  this.$emit('play-mode-changed');
                }, PlayerPage.doubleTapDelay);
              }
            },
          },
        },
      },
    });
  }

  static _getUpdates(videos) {
    const player = document.getElementsByTagName('video')[0];

    this.socket = io.connect();

    // Handle events from the hardware controller.
    this.socket.on('controller', (data) => {
      if (data.knob === 'clockwise') {
        player.currentTime += this.knobRate;
      } else if (data.knob === 'anticlockwise') {
        player.currentTime -= this.knobRate;
      } else if (data.knob === 'release') {
        document.getElementById('click-target').dispatchEvent(new Event('pointerup'));
      } else if (data.status === 'connected') {
        this.app.controllerConnected = true;
      } else if (data.status === 'disconnected') {
        this.app.controllerConnected = false;
      } else if (data.battery) {
        this.app.controllerBattery = data.battery;
      }
    });

    // Update the selected video
    this.socket.on('videoSelected', (video) => {
      this.app.selectedVideo = videos.find(v => v.url === video.url);
    });

    // Get new videos
    this.socket.on('videoAdded', (video) => {
      videos.push(video);
    });

    // Remove videos
    this.socket.on('videoRemoved', (video) => {
      const index = videos.findIndex(v => v.url === video.url);
      if (index === -1) {
        return;
      }
      videos.splice(index, 1);
      PlayerPage.nextVideo();
    });

    // Update existing videos
    this.socket.on('videoUpdated', (video) => {
      const index = videos.findIndex(v => v.url === video.url);
      if (index === -1) {
        return;
      }
      Vue.set(videos, index, video);
      if (video.selected) {
        this.app.selectedVideo = video;
      }
    });
  }

  // Select another random video
  static nextVideo() {
    let unplayed = this.app.videos.filter(v => !v.played && v.loaded);

    if (!unplayed.length) {
      // All videos played
      this.app.videos.forEach((v) => {
        v.played = false;
      });
      unplayed = this.app.videos.filter(v => !v.played && v.loaded);
    }

    const random = unplayed[Math.floor(Math.random() * unplayed.length)];
    this.socket.emit('selectVideo', { url: random.url });
  }
}

module.exports = PlayerPage;
