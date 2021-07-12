import WebTorrent, { TorrentOptions, Torrent } from "webtorrent";
import axios from "axios";
import ParseTorrent from "parse-torrent";

declare module "webtorrent" {
	export interface Torrent {
		urlList: string[];
	}
}

class TorrentURL {
	private client: WebTorrent.Instance = new WebTorrent();

	constructor(private indexURL = "https://index.torrent-url.tk") {
		axios.defaults.baseURL = this.indexURL;
	}

	fetch(url: string): Promise<Response> {
		return new Promise((resolve, reject) => {
			const torrent: Torrent | undefined = this.client.torrents.find(
				({ urlList }) => urlList.some(item => item === url)
			);
			if (torrent) {
				if (torrent.done) {
					torrent.files[0].getBlob((error, blob) => {
						if (error) reject(error);
						else if (blob) resolve(new Response(blob));
						else reject();
					});
				} else {
					torrent.on("done", () => {
						torrent.files[0].getBlob((error, blob) => {
							if (error) reject(error);
							else if (blob) resolve(new Response(blob));
							else reject();
						});
					});
				}
			} else {
				axios
					.get(`/${url}`, {
						transformResponse(response) {
							try {
								return JSON.parse(response, (key, value) => {
									if (value.type && value.type === "Buffer")
										return Buffer.from(value.data);
									else return value;
								});
							} catch (error) {
								return response;
							}
						}
					})
					.then(response => {
						// TypeError: parsed.created.getTime is not a function
						response.data.created = new Date(response.data.created);
						this.client.add(
							ParseTorrent.toTorrentFile(response.data),
							torrent => {
								console.log("torrent added", torrent);

								torrent.on("done", () => {
									console.log("torrent done");
									torrent.files[0].getBlob((error, blob) => {
										if (error) reject(error);
										else if (blob) resolve(new Response(blob));
										else reject();
									});

									torrent.on("noPeers", announceType => {
										console.log("noPeers", announceType);
									});
								});
							}
						);
					})
					.catch(error => {
						console.log("ERROR", error);
						fetch(url)
							.then(response => {
								resolve(response);

								response.blob().then(async blob => {
									const opts: { name: string; urlList?: string[] } = {
										name: "webtorrent-url-fetch"
									};

									await this.testWebSeed(url).then(() => {
										opts.urlList = [url];
									});

									this.client.seed(
										<File>blob,
										<TorrentOptions>opts,
										torrent => {
											axios.post("/", ParseTorrent(torrent.torrentFile));
											console.log(torrent);
										}
									);
								});
							})
							.catch(reject);
					});
			}
		});
	}

	// seed exist data from cache, localStorage, indexedDB etc...
	async seed(url: string, data: Blob): Promise<void> {
		const opts: { name: string; urlList?: string[] } = {
			name: "webtorrent-url-fetch"
		};

		await this.testWebSeed(url).then(() => {
			opts.urlList = [url];
		});

		this.client.seed(<File>data, <TorrentOptions>opts, torrent => {
			// check the torrent is registered in index
			axios.post("/", ParseTorrent(torrent.torrentFile));
		});
	}

	private testWebSeed(url: string): Promise<void> {
		return new Promise((resolve, reject) => {
			fetch(url, { method: "HEAD", headers: { range: "bytes=0-127" } })
				.then(response => {
					if (
						response.status === 206
						/* && response.headers.get("content-length") === 128 */
					) {
						resolve();
					} else reject();
				})
				.catch(reject);
		});
	}
}

export = TorrentURL;