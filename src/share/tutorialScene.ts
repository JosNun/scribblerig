/**
 * The onboarding tutorial scene: a single playable Rube-Goldberg chain that
 * exercises every body and connector type. Hand-authored by the maintainer
 * in the running app, then exported via the share link and re-emitted here
 * as a Scene literal.
 *
 * Regenerate with:
 *   bun run .scratch/onboarding-tutorial/regen-tutorial.ts <url>
 *
 * Wiring this into `bootSession` and a "Show tutorial" button is the next
 * step (PRD); this constant is the scene itself.
 */

import type { Scene } from "../scene/scene";

export const TUTORIAL_TITLE = "Tutorial";

export const tutorialScene: Scene = {
  "version": 1,
  "nextId": 285,
  "rooms": [
    {
      "settings": {
        "gravity": {
          "x": 0,
          "y": -9.81
        },
        "walls": {
          "floor": true,
          "ceiling": false,
          "left": false,
          "right": false
        },
        "size": {
          "width": 12,
          "height": 12
        },
        "snap": false
      },
      "bodies": [
        {
          "id": "b14",
          "type": "platform",
          "position": {
            "x": -3.467789242488363,
            "y": 10.154179765807116
          },
          "rotation": -0.17655157737495353,
          "props": {
            "width": 4.658263714109204,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b15",
          "type": "text",
          "position": {
            "x": -3.8209475181710264,
            "y": 11.627617840267877
          },
          "rotation": 0,
          "props": {
            "text": "Welcome to ScribbleRig!",
            "size": 0.4,
            "static": true
          }
        },
        {
          "id": "b16",
          "type": "text",
          "position": {
            "x": -3.3797140296210046,
            "y": 11.0663656400395
          },
          "rotation": 0.008960023396719752,
          "props": {
            "text": "< Hey look, this'll spawn a ball",
            "size": 0.25,
            "static": true
          }
        },
        {
          "id": "b17",
          "type": "platform",
          "position": {
            "x": -1.2691810106614363,
            "y": 10.451059600502004
          },
          "rotation": 1.5154541565633068,
          "props": {
            "width": 1.1150938512592057,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b20",
          "type": "text",
          "position": {
            "x": 0.12016551218766419,
            "y": 11.17759692702998
          },
          "rotation": 0,
          "props": {
            "text": "This platform is attached with a \"pin\" \nObjects can spin freely around pins",
            "size": 0.15,
            "static": true
          }
        },
        {
          "id": "b21",
          "type": "platform",
          "position": {
            "x": -0.5762087044733728,
            "y": 8.942768930828448
          },
          "rotation": 0,
          "props": {
            "width": 1.964563030875064,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b22",
          "type": "platform",
          "position": {
            "x": -0.5671854511495701,
            "y": 9.231793498805745
          },
          "rotation": -1.5863475706198085,
          "props": {
            "width": 0.6100968519610501,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b25",
          "type": "platform",
          "position": {
            "x": -0.5581104496167371,
            "y": 8.600642185723478
          },
          "rotation": 0,
          "props": {
            "width": 1.9018629122876871,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b28",
          "type": "spawner",
          "position": {
            "x": -5.578752979682934,
            "y": 11.126266479705205
          },
          "rotation": 0,
          "props": {
            "interval": 5,
            "maxAlive": 10,
            "speed": 0,
            "static": true
          },
          "template": {
            "bodies": [
              {
                "id": "b29",
                "type": "ball",
                "position": {
                  "x": -0.0867104561386842,
                  "y": 0.027153091712326854
                },
                "rotation": 0,
                "props": {
                  "radius": 0.14431352542561685,
                  "friction": 0.5,
                  "restitution": 0,
                  "density": 1
                }
              }
            ],
            "connectors": []
          }
        },
        {
          "id": "b30",
          "type": "text",
          "position": {
            "x": 1.0977659064180219,
            "y": 9.552438268787466
          },
          "rotation": 0,
          "props": {
            "text": "These platforms are attached with a weld\nWelds are permanent, fixed joints",
            "size": 0.2,
            "static": true
          }
        },
        {
          "id": "b31",
          "type": "text",
          "position": {
            "x": -0.5284748769165034,
            "y": 8.28977500814432
          },
          "rotation": 0,
          "props": {
            "text": "This \"static\" platform won't move\nwhen things hit it",
            "size": 0.15,
            "static": true
          }
        },
        {
          "id": "b33",
          "type": "platform",
          "position": {
            "x": 1.1462972976040757,
            "y": 7.895284757652784
          },
          "rotation": 0,
          "props": {
            "width": 1.6749564145200182,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b37",
          "type": "platform",
          "position": {
            "x": 1.142730991195244,
            "y": 7.8933262268625635
          },
          "rotation": -1.581858817847141,
          "props": {
            "width": 1.6749564145200182,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b53",
          "type": "platform",
          "position": {
            "x": 0.17429139234139085,
            "y": 7.2421034350594
          },
          "rotation": -0.8565535902528747,
          "props": {
            "width": 0.918207298778379,
            "height": 0.19755445493287296,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b54",
          "type": "platform",
          "position": {
            "x": 1.330205690560635,
            "y": 6.700017307478686
          },
          "rotation": -0.19808251585494885,
          "props": {
            "width": 1.7488337999102863,
            "height": 0.19674239308196145,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b55",
          "type": "platform",
          "position": {
            "x": 3.095273759174981,
            "y": 6.540129834216669
          },
          "rotation": 0,
          "props": {
            "width": 1.4890354792882636,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b56",
          "type": "platform",
          "position": {
            "x": 3.080383047182324,
            "y": 6.543153964393646
          },
          "rotation": -1.5632814215435313,
          "props": {
            "width": 1.4890354792882636,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b61",
          "type": "text",
          "position": {
            "x": 3.7116604735058925,
            "y": 7.255665239426988
          },
          "rotation": -0.34401743213646574,
          "props": {
            "text": "Motors spin things",
            "size": 0.2,
            "static": true
          }
        },
        {
          "id": "b62",
          "type": "text",
          "position": {
            "x": 2.426298570169974,
            "y": 8.63784572687669
          },
          "rotation": -0.17194949128771708,
          "props": {
            "text": "By welding multiple bodies together,\nyou can make more complex shapes...\nLike Pinwheels!",
            "size": 0.15,
            "static": true
          }
        },
        {
          "id": "b63",
          "type": "platform",
          "position": {
            "x": -3.9038514242817532,
            "y": 7.733033699917918
          },
          "rotation": -0.8468280827158301,
          "props": {
            "width": 1.4209207493015539,
            "height": 0.11365524754492645,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b66",
          "type": "platform",
          "position": {
            "x": -4.844262872708595,
            "y": 8.077172674042878
          },
          "rotation": -0.7054097277851639,
          "props": {
            "width": 0.7794952130258449,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b69",
          "type": "platform",
          "position": {
            "x": -2.162419970722018,
            "y": 8.280338290572445
          },
          "rotation": 0.3979775007021622,
          "props": {
            "width": 1.2252841548922375,
            "height": 0.10868291660604497,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b70",
          "type": "platform",
          "position": {
            "x": -3.466121763105776,
            "y": 7.84598768827545
          },
          "rotation": -1.6497692655981713,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b71",
          "type": "platform",
          "position": {
            "x": -2.9724894433956357,
            "y": 7.510175657036575
          },
          "rotation": 0.3562882038260824,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b72",
          "type": "platform",
          "position": {
            "x": -3.5631799171965035,
            "y": 7.262421334098287
          },
          "rotation": -2.567166185809012,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b82",
          "type": "text",
          "position": {
            "x": -4.521579371858194,
            "y": 8.541344700207254
          },
          "rotation": -0.21406006274398548,
          "props": {
            "text": "Springs... Act like springs",
            "size": 0.25,
            "static": true
          }
        },
        {
          "id": "b83",
          "type": "text",
          "position": {
            "x": 1.2536359504728662,
            "y": 11.633894783600672
          },
          "rotation": 0,
          "props": {
            "text": "Hit ▶ above to see the mechanism work",
            "size": 0.30000000000000004,
            "static": true
          }
        },
        {
          "id": "b86",
          "type": "platform",
          "position": {
            "x": 5.011179148880011,
            "y": 5.150352592062266
          },
          "rotation": -0.003424887797388587,
          "props": {
            "width": 1.8335056101775788,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b89",
          "type": "platform",
          "position": {
            "x": 3.227894329316923,
            "y": 5.545243636032816
          },
          "rotation": -0.4184189395228375,
          "props": {
            "width": 1.7350930840624565,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b91",
          "type": "text",
          "position": {
            "x": 5.241378722390019,
            "y": 5.518958849057314
          },
          "rotation": 0,
          "props": {
            "text": "Oh No!",
            "size": 0.4,
            "static": true
          }
        },
        {
          "id": "b92",
          "type": "text",
          "position": {
            "x": 5.025506684506093,
            "y": 4.8472876391787585
          },
          "rotation": 0,
          "props": {
            "text": "This panel is set to static",
            "size": 0.15,
            "static": true
          }
        },
        {
          "id": "b93",
          "type": "text",
          "position": {
            "x": 4.3795830632727455,
            "y": 4.394995616335635
          },
          "rotation": 0,
          "props": {
            "text": "Stop the simulation, select this panel,\nand uncheck the \"static\" checkbox",
            "size": 0.2,
            "static": true
          }
        },
        {
          "id": "b94",
          "type": "platform",
          "position": {
            "x": -1.8962551438765258,
            "y": 5.203118536896554
          },
          "rotation": -0.17862799716778577,
          "props": {
            "width": 1.1912885033276956,
            "height": 0.14926910920679504,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b97",
          "type": "platform",
          "position": {
            "x": -1.3398085708091378,
            "y": 4.4195166094983165
          },
          "rotation": -1.7611939667983945,
          "props": {
            "width": 1.3093254343632208,
            "height": 0.1,
            "friction": 0,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b98",
          "type": "platform",
          "position": {
            "x": -0.2495819574429844,
            "y": 5.324594252578517
          },
          "rotation": -1.5811484664778837,
          "props": {
            "width": 4.188429736588439,
            "height": 0.1,
            "friction": 0,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b99",
          "type": "ball",
          "position": {
            "x": -3.693407403481585,
            "y": 2.70590478028755
          },
          "rotation": 0,
          "props": {
            "radius": 0.2923494107713728,
            "friction": 0.5,
            "restitution": 0.5,
            "density": 1
          }
        },
        {
          "id": "b100",
          "type": "ball",
          "position": {
            "x": -0.379491056725203,
            "y": 2.014614354132886
          },
          "rotation": 0,
          "props": {
            "radius": 0.5,
            "friction": 0.5,
            "restitution": 0.5,
            "density": 1
          }
        },
        {
          "id": "b103",
          "type": "platform",
          "position": {
            "x": -3.7498392439095354,
            "y": 3.057524525932356
          },
          "rotation": 0.14185629204908023,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b104",
          "type": "platform",
          "position": {
            "x": -3.2884110508215416,
            "y": 3.076081559290009
          },
          "rotation": 0,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b106",
          "type": "platform",
          "position": {
            "x": -2.84948353454383,
            "y": 3.04188140690359
          },
          "rotation": -0.16501316320704484,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b108",
          "type": "platform",
          "position": {
            "x": -2.4107093821781658,
            "y": 2.9715969169256073
          },
          "rotation": -0.16501316320704484,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b109",
          "type": "platform",
          "position": {
            "x": -1.9920259022906213,
            "y": 2.891365681794881
          },
          "rotation": -0.16501316320704484,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b110",
          "type": "platform",
          "position": {
            "x": -1.5909573631581573,
            "y": 2.811222083185324
          },
          "rotation": -0.16501316320704484,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b111",
          "type": "platform",
          "position": {
            "x": -1.1625243202905002,
            "y": 2.738330406702547
          },
          "rotation": -0.16501316320704484,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b112",
          "type": "platform",
          "position": {
            "x": -0.741189835637577,
            "y": 2.6719238327863177
          },
          "rotation": -0.16501316320704484,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b113",
          "type": "platform",
          "position": {
            "x": -0.3361338347918985,
            "y": 2.607204261902602
          },
          "rotation": -0.16501316320704484,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b114",
          "type": "platform",
          "position": {
            "x": 0.04926967618150751,
            "y": 2.4412864181983442
          },
          "rotation": -0.6598517578234329,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b115",
          "type": "platform",
          "position": {
            "x": 0.25720923178656674,
            "y": 2.10524417777369
          },
          "rotation": -1.368629311140971,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b116",
          "type": "platform",
          "position": {
            "x": 0.14946012900860012,
            "y": 1.720015939842623
          },
          "rotation": -2.3049548619797493,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b117",
          "type": "platform",
          "position": {
            "x": -0.19707658482610865,
            "y": 1.4697917627732537
          },
          "rotation": -2.7948878291253947,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b118",
          "type": "platform",
          "position": {
            "x": -0.6044111352221955,
            "y": 1.4476635411779415
          },
          "rotation": -3.416622899894251,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b119",
          "type": "platform",
          "position": {
            "x": -1.0068599495630797,
            "y": 1.5688648499554347
          },
          "rotation": -3.416622899894251,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b120",
          "type": "platform",
          "position": {
            "x": -1.4318970772354165,
            "y": 1.687086517013163
          },
          "rotation": -3.416622899894251,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b121",
          "type": "platform",
          "position": {
            "x": -1.8509311032076388,
            "y": 1.8085726444844572
          },
          "rotation": -3.416622899894251,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b122",
          "type": "platform",
          "position": {
            "x": -2.2686286722320257,
            "y": 1.9123561946795016
          },
          "rotation": -3.416622899894251,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b123",
          "type": "platform",
          "position": {
            "x": -2.663080654016188,
            "y": 2.0184402035552464
          },
          "rotation": -3.416622899894251,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b124",
          "type": "platform",
          "position": {
            "x": -3.0889065103790507,
            "y": 2.138984238423969
          },
          "rotation": -3.416622899894251,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b125",
          "type": "platform",
          "position": {
            "x": -3.5003599772701066,
            "y": 2.2369837782218225
          },
          "rotation": -3.416622899894251,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b126",
          "type": "platform",
          "position": {
            "x": -3.9058322515913395,
            "y": 2.4106136357890016
          },
          "rotation": -3.7801813387128878,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b127",
          "type": "platform",
          "position": {
            "x": -4.017722179994569,
            "y": 2.784492944228611
          },
          "rotation": 1.3614125003004167,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b151",
          "type": "platform",
          "position": {
            "x": -0.30262457568088663,
            "y": 2.8187273214085393
          },
          "rotation": -1.7008811485888875,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b153",
          "type": "platform",
          "position": {
            "x": -0.6449724247512933,
            "y": 1.245880338909179
          },
          "rotation": -1.7008811485888875,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b155",
          "type": "platform",
          "position": {
            "x": -1.891301306895028,
            "y": 1.5983245749708042
          },
          "rotation": -1.7008811485888875,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b157",
          "type": "text",
          "position": {
            "x": -2.1215890163461713,
            "y": 2.1655542167127675
          },
          "rotation": -0.11891163076896283,
          "props": {
            "text": "Shapes and connections can be \ncombined into complex mechanisms",
            "size": 0.15,
            "static": true
          }
        },
        {
          "id": "b158",
          "type": "spawner",
          "position": {
            "x": -5.609707206798284,
            "y": 1.380481987443383
          },
          "rotation": 0,
          "props": {
            "interval": 15.150000000000002,
            "maxAlive": 5,
            "speed": 0,
            "static": true
          },
          "template": {
            "bodies": [
              {
                "id": "b159",
                "type": "platform",
                "position": {
                  "x": -0.04414579218117749,
                  "y": -0.3494418602037807
                },
                "rotation": 0,
                "props": {
                  "width": 0.5,
                  "height": 0.1,
                  "friction": 0.6,
                  "restitution": 0,
                  "static": false
                }
              },
              {
                "id": "b160",
                "type": "ball",
                "position": {
                  "x": -0.2287349544305759,
                  "y": -0.35648523427730067
                },
                "rotation": 0,
                "props": {
                  "radius": 0.1,
                  "friction": 0.5,
                  "restitution": 0.5,
                  "density": 1
                }
              },
              {
                "id": "b165",
                "type": "ball",
                "position": {
                  "x": 0.16026320183243403,
                  "y": -0.35322888559866517
                },
                "rotation": 0,
                "props": {
                  "radius": 0.1,
                  "friction": 0.5,
                  "restitution": 0.5,
                  "density": 1
                }
              },
              {
                "id": "b176",
                "type": "platform",
                "position": {
                  "x": -0.3492625142205197,
                  "y": 0.14881525814089686
                },
                "rotation": 0.4889724310822281,
                "props": {
                  "width": 0.5,
                  "height": 0.1,
                  "friction": 0.6,
                  "restitution": 0,
                  "static": false
                }
              },
              {
                "id": "b178",
                "type": "platform",
                "position": {
                  "x": 0.01465259303710545,
                  "y": 0.14025538837264148
                },
                "rotation": -0.5057132123129005,
                "props": {
                  "width": 0.5,
                  "height": 0.1,
                  "friction": 0.6,
                  "restitution": 0,
                  "static": false
                }
              },
              {
                "id": "b180",
                "type": "ball",
                "position": {
                  "x": 0.17573513876161492,
                  "y": 0.04229416592806389
                },
                "rotation": 0,
                "props": {
                  "radius": 0.1,
                  "friction": 0.5,
                  "restitution": 0.5,
                  "density": 1
                }
              },
              {
                "id": "b181",
                "type": "ball",
                "position": {
                  "x": -0.513416622400582,
                  "y": 0.06449700341223662
                },
                "rotation": 0,
                "props": {
                  "radius": 0.1,
                  "friction": 0.5,
                  "restitution": 0.5,
                  "density": 1
                }
              }
            ],
            "connectors": [
              {
                "id": "c166",
                "type": "pin",
                "a": {
                  "body": "b165",
                  "local": {
                    "x": -0.02182853488565517,
                    "y": -0.0029259879206971155
                  }
                },
                "b": {
                  "body": "b159",
                  "local": {
                    "x": 0.1816526748526811,
                    "y": -0.0009223597354154605
                  }
                },
                "props": {}
              },
              {
                "id": "c167",
                "type": "motor",
                "a": {
                  "body": "b160",
                  "local": {
                    "x": 0.0016135369335852079,
                    "y": 0.004170857158879751
                  }
                },
                "b": {
                  "body": "b159",
                  "local": {
                    "x": -0.20565835121823173,
                    "y": 0.004613742409994419
                  }
                },
                "props": {
                  "speed": 4,
                  "torque": 1503,
                  "reverse": false
                }
              },
              {
                "id": "c179",
                "type": "weld",
                "a": {
                  "body": "b178",
                  "local": {
                    "x": -0.20035720033194077,
                    "y": -0.005697967592848421
                  }
                },
                "b": {
                  "body": "b176",
                  "local": {
                    "x": 0.20332320050303737,
                    "y": -0.013581590552896858
                  }
                },
                "props": {}
              },
              {
                "id": "c182",
                "type": "motor",
                "a": {
                  "body": "b181",
                  "local": {
                    "x": -0.014460637669806986,
                    "y": -0.026937736544198038
                  }
                },
                "b": {
                  "body": "b176",
                  "local": {
                    "x": -0.20994300523044734,
                    "y": -0.014319831840076236
                  }
                },
                "props": {
                  "speed": 4,
                  "torque": 10000,
                  "reverse": false
                }
              },
              {
                "id": "c183",
                "type": "pin",
                "a": {
                  "body": "b180",
                  "local": {
                    "x": -0.028351860416730656,
                    "y": -0.007272759901847302
                  }
                },
                "b": {
                  "body": "b178",
                  "local": {
                    "x": 0.16709533468079787,
                    "y": -0.027762834701673192
                  }
                },
                "props": {}
              }
            ]
          }
        },
        {
          "id": "b168",
          "type": "platform",
          "position": {
            "x": -5.5784331377906415,
            "y": 1.8488679555037855
          },
          "rotation": -0.5108168221892213,
          "props": {
            "width": 0.6686158944254863,
            "height": 0.11514577958631286,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b169",
          "type": "platform",
          "position": {
            "x": -2.7134110529198674,
            "y": 0.5458434538428832
          },
          "rotation": -0.164115179794303,
          "props": {
            "width": 6.052916162537047,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b170",
          "type": "platform",
          "position": {
            "x": -1.9515450772826872,
            "y": 3.1165947891589525
          },
          "rotation": -1.7008811485888875,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b171",
          "type": "platform",
          "position": {
            "x": -3.0778421428299128,
            "y": 1.90324644153237
          },
          "rotation": -1.7008811485888875,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b172",
          "type": "platform",
          "position": {
            "x": -3.7562954398026482,
            "y": 3.2777606696906774
          },
          "rotation": -1.4353809673424454,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b184",
          "type": "text",
          "position": {
            "x": -4.444657143333594,
            "y": 0.5266510604277385
          },
          "rotation": -0.1624198814782356,
          "props": {
            "text": "^ Spawners can contain multiple constructions\nIt will round-robin between spawning items",
            "size": 0.15,
            "static": true
          }
        },
        {
          "id": "b185",
          "type": "platform",
          "position": {
            "x": 5.918783924199755,
            "y": 5.975859580167416
          },
          "rotation": -1.577278827834709,
          "props": {
            "width": 1.4365627715607434,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b186",
          "type": "text",
          "position": {
            "x": 4.010400146484375,
            "y": 0.3906200570773246
          },
          "rotation": 0,
          "props": {
            "text": "Hit the \"Builds\" button to start \nmaking your own contraptions!",
            "size": 0.30000000000000004,
            "static": true
          }
        },
        {
          "id": "b187",
          "type": "platform",
          "position": {
            "x": 3.0301646091598515,
            "y": 3.193761466773943
          },
          "rotation": -0.85836220625101,
          "props": {
            "width": 0.6456462631732747,
            "height": 0.12574593798320333,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b188",
          "type": "platform",
          "position": {
            "x": 2.85346694303697,
            "y": 3.6444701224773564
          },
          "rotation": -1.5695667886323055,
          "props": {
            "width": 0.6456462631732747,
            "height": 0.12574593798320333,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b190",
          "type": "platform",
          "position": {
            "x": 4.136384894578054,
            "y": 3.625937598373198
          },
          "rotation": -1.5695667886323055,
          "props": {
            "width": 0.6456462631732747,
            "height": 0.12574593798320333,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b191",
          "type": "platform",
          "position": {
            "x": 3.95046837702219,
            "y": 3.1542150974559693
          },
          "rotation": 0.8259265168411356,
          "props": {
            "width": 0.6456462631732747,
            "height": 0.12574593798320333,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b196",
          "type": "platform",
          "position": {
            "x": 4.442096441292282,
            "y": 9.590301628975816
          },
          "rotation": 0,
          "props": {
            "width": 2.6050684943570306,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 1,
            "static": true
          }
        },
        {
          "id": "b197",
          "type": "ball",
          "position": {
            "x": 3.4252852178988786,
            "y": 11.37807485815622
          },
          "rotation": 0,
          "props": {
            "radius": 0.1,
            "friction": 0.5,
            "restitution": 0.5,
            "density": 1
          }
        },
        {
          "id": "b198",
          "type": "ball",
          "position": {
            "x": 4.793234456501247,
            "y": 11.387823727927564
          },
          "rotation": 0,
          "props": {
            "radius": 0.1,
            "friction": 0.5,
            "restitution": 1,
            "density": 1
          }
        },
        {
          "id": "b199",
          "type": "text",
          "position": {
            "x": 4.43723229290964,
            "y": 10.267304599397653
          },
          "rotation": 0,
          "props": {
            "text": "Objects have configurable properties.\nThese balls have different \"bounciness\"",
            "size": 0.15,
            "static": true
          }
        },
        {
          "id": "b200",
          "type": "ball",
          "position": {
            "x": 3.697237887543842,
            "y": 11.379062405814379
          },
          "rotation": 0,
          "props": {
            "radius": 0.1,
            "friction": 0.5,
            "restitution": 0.6,
            "density": 1
          }
        },
        {
          "id": "b201",
          "type": "ball",
          "position": {
            "x": 3.97949696365759,
            "y": 11.384233564460738
          },
          "rotation": 0,
          "props": {
            "radius": 0.1,
            "friction": 0.5,
            "restitution": 0.7,
            "density": 1
          }
        },
        {
          "id": "b202",
          "type": "ball",
          "position": {
            "x": 4.2371571253772,
            "y": 11.387896468501909
          },
          "rotation": 0,
          "props": {
            "radius": 0.1,
            "friction": 0.5,
            "restitution": 0.8,
            "density": 1
          }
        },
        {
          "id": "b203",
          "type": "ball",
          "position": {
            "x": 4.503058821189445,
            "y": 11.394288595161992
          },
          "rotation": 0,
          "props": {
            "radius": 0.1,
            "friction": 0.5,
            "restitution": 0.9,
            "density": 1
          }
        },
        {
          "id": "b204",
          "type": "platform",
          "position": {
            "x": 0.5756314579400182,
            "y": 5.172103604085879
          },
          "rotation": -1.5721684863265106,
          "props": {
            "width": 1.5545499138289491,
            "height": 0.1,
            "friction": 0,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b205",
          "type": "ball",
          "position": {
            "x": 0.18175218356788012,
            "y": 4.783629499764318
          },
          "rotation": 0,
          "props": {
            "radius": 0.19814659150926117,
            "friction": 0.5,
            "restitution": 0.5,
            "density": 1
          }
        },
        {
          "id": "b207",
          "type": "platform",
          "position": {
            "x": 0.14985823194075873,
            "y": 5.132196532690214
          },
          "rotation": 0,
          "props": {
            "width": 0.7272484904899232,
            "height": 0.24577973925288002,
            "friction": 0,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b208",
          "type": "platform",
          "position": {
            "x": 0.3556980631043185,
            "y": 6.211622409328348
          },
          "rotation": 0,
          "props": {
            "width": 1.2620916711071506,
            "height": 0.11093251858667053,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b210",
          "type": "platform",
          "position": {
            "x": 0.17298972068649662,
            "y": 5.633313847700221
          },
          "rotation": -1.562414527075944,
          "props": {
            "width": 0.8863781892538354,
            "height": 0.10238496517515425,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b222",
          "type": "platform",
          "position": {
            "x": 0.1600957767533182,
            "y": 4.445659229645226
          },
          "rotation": 0,
          "props": {
            "width": 0.9099549633076147,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b223",
          "type": "platform",
          "position": {
            "x": 3.2364799687437262,
            "y": 2.0781282430656436
          },
          "rotation": 0,
          "props": {
            "width": 1.2937778570896754,
            "height": 0.15107261572482678,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b226",
          "type": "platform",
          "position": {
            "x": 4.101715494417346,
            "y": 2.174836989177481
          },
          "rotation": 1.5233553203011634,
          "props": {
            "width": 0.7320849445752331,
            "height": 0.11743333220699284,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b227",
          "type": "platform",
          "position": {
            "x": 4.971775309222615,
            "y": 2.1380245211901943
          },
          "rotation": -0.4161875004338036,
          "props": {
            "width": 1.966863412833949,
            "height": 0.13210726232354203,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b228",
          "type": "ball",
          "position": {
            "x": 5.571036230034602,
            "y": 3.7210678321481296
          },
          "rotation": 0,
          "props": {
            "radius": 0.3117349667043912,
            "friction": 0.5,
            "restitution": 0.5,
            "density": 1
          }
        },
        {
          "id": "b235",
          "type": "platform",
          "position": {
            "x": 0.6727086953015218,
            "y": 2.7940683523786447
          },
          "rotation": -1.3497455026214473,
          "props": {
            "width": 1.4331629809016695,
            "height": 0.1835828368531907,
            "friction": 0.6,
            "restitution": 0,
            "static": true
          }
        },
        {
          "id": "b256",
          "type": "platform",
          "position": {
            "x": 0.7635762024950371,
            "y": 6.003927721007772
          },
          "rotation": -1.1379774696165723,
          "props": {
            "width": 0.5,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b257",
          "type": "platform",
          "position": {
            "x": 1.058191632739316,
            "y": 6.02314455003164
          },
          "rotation": -0.6669726919368334,
          "props": {
            "width": 0.5611609516541842,
            "height": 0.1,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b258",
          "type": "platform",
          "position": {
            "x": 1.1902682542853806,
            "y": 6.133483113515695
          },
          "rotation": -0.24677405207697722,
          "props": {
            "width": 0.6063537685150784,
            "height": 0.1069819510182499,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b259",
          "type": "platform",
          "position": {
            "x": 1.1934609990824843,
            "y": 6.2383062991315
          },
          "rotation": 0.0604941808314865,
          "props": {
            "width": 0.6063537685150784,
            "height": 0.1069819510182499,
            "friction": 0.6,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b265",
          "type": "spawner",
          "position": {
            "x": -3.692840597966948,
            "y": 6.2228763028797305
          },
          "rotation": -2.7067271218546756,
          "props": {
            "interval": 5,
            "maxAlive": 1,
            "speed": 14.5,
            "static": true
          },
          "template": {
            "bodies": [
              {
                "id": "b267",
                "type": "platform",
                "position": {
                  "x": -0.038669440759773493,
                  "y": 0.022816891945845727
                },
                "rotation": 0,
                "props": {
                  "width": 0.5,
                  "height": 0.5,
                  "friction": 0.5,
                  "restitution": 0,
                  "static": false
                }
              }
            ],
            "connectors": []
          }
        },
        {
          "id": "b268",
          "type": "platform",
          "position": {
            "x": -5.3570689179536775,
            "y": 6.2330852229096365
          },
          "rotation": -1.5821614401990782,
          "props": {
            "width": 1.6639660395813418,
            "height": 0.13013998794344117,
            "friction": 1,
            "restitution": 0,
            "static": false
          }
        },
        {
          "id": "b275",
          "type": "platform",
          "position": {
            "x": -3.3238713480073625,
            "y": 5.046626386664964
          },
          "rotation": 1.2051012069652616,
          "props": {
            "width": 1.83700709910499,
            "height": 0.15337025710745725,
            "friction": 1,
            "restitution": 0,
            "static": false
          }
        }
      ],
      "connectors": [
        {
          "id": "c26",
          "type": "pin",
          "a": {
            "body": "b21",
            "local": {
              "x": -0.006269292096630408,
              "y": -0.0029622996132872004
            }
          },
          "b": {
            "world": {
              "x": -0.5824779965700032,
              "y": 8.939806631215161
            }
          },
          "props": {}
        },
        {
          "id": "c27",
          "type": "weld",
          "a": {
            "body": "b22",
            "local": {
              "x": 0.25268651775095036,
              "y": 0.018433192071885658
            }
          },
          "b": {
            "body": "b21",
            "local": {
              "x": 0.023524785226814338,
              "y": 0.036081957103750284
            }
          },
          "props": {}
        },
        {
          "id": "c32",
          "type": "pin",
          "a": {
            "body": "b17",
            "local": {
              "x": 0.5231167288764769,
              "y": 0.003502884016342557
            }
          },
          "b": {
            "world": {
              "x": -1.2437428924928269,
              "y": 10.973569202682574
            }
          },
          "props": {}
        },
        {
          "id": "c36",
          "type": "pin",
          "a": {
            "body": "b33",
            "local": {
              "x": -0.0013488461190152012,
              "y": -0.00033238774384347636
            }
          },
          "b": {
            "world": {
              "x": 1.1449484514850605,
              "y": 7.894952369908941
            }
          },
          "props": {}
        },
        {
          "id": "c38",
          "type": "weld",
          "a": {
            "body": "b37",
            "local": {
              "x": -0.025900189422811606,
              "y": -0.023230179110445684
            }
          },
          "b": {
            "body": "b33",
            "local": {
              "x": -0.02650854932434399,
              "y": 0.02419705223991908
            }
          },
          "props": {}
        },
        {
          "id": "c59",
          "type": "motor",
          "a": {
            "body": "b55",
            "local": {
              "x": -0.02318660765764946,
              "y": 0.009753302090654614
            }
          },
          "b": {
            "world": {
              "x": 3.0720871515173314,
              "y": 6.549883136307324
            }
          },
          "props": {
            "speed": 2,
            "torque": 10000,
            "reverse": true
          }
        },
        {
          "id": "c60",
          "type": "weld",
          "a": {
            "body": "b56",
            "local": {
              "x": -0.014672694361086197,
              "y": 0.024204373575017014
            }
          },
          "b": {
            "body": "b55",
            "local": {
              "x": 0.008707923592350841,
              "y": 0.017878302090655218
            }
          },
          "props": {}
        },
        {
          "id": "c64",
          "type": "spring",
          "a": {
            "body": "b63",
            "local": {
              "x": -0.7104603746507769,
              "y": -0.056827623772463226
            }
          },
          "b": {
            "world": {
              "x": -5.185516795283855,
              "y": 7.167225585573877
            }
          },
          "props": {
            "stiffness": 84,
            "restLength": 1,
            "damping": 3,
            "collide": true
          }
        },
        {
          "id": "c75",
          "type": "weld",
          "a": {
            "body": "b72",
            "local": {
              "x": -0.06427298375122856,
              "y": 0.01066439261495853
            }
          },
          "b": {
            "body": "b63",
            "local": {
              "x": 0.5229875150994564,
              "y": -0.0031276455575662276
            }
          },
          "props": {}
        },
        {
          "id": "c79",
          "type": "pin",
          "a": {
            "body": "b63",
            "local": {
              "x": -0.023283006944126418,
              "y": 0.010113824658211952
            }
          },
          "b": {
            "world": {
              "x": -3.911696114748308,
              "y": 7.757175959403336
            }
          },
          "props": {}
        },
        {
          "id": "c81",
          "type": "motor",
          "a": {
            "body": "b66",
            "local": {
              "x": 0.009538359477406857,
              "y": -0.006847303281079749
            }
          },
          "b": {
            "world": {
              "x": -4.841440301675559,
              "y": 8.065775351703538
            }
          },
          "props": {
            "speed": 1.5,
            "torque": 10000,
            "reverse": false
          }
        },
        {
          "id": "c88",
          "type": "spring",
          "a": {
            "body": "b86",
            "local": {
              "x": -0.8778379032424117,
              "y": 0.05
            }
          },
          "b": {
            "world": {
              "x": 4.8111152684811,
              "y": 6.116316089876854
            }
          },
          "props": {
            "stiffness": 3,
            "restLength": 0.8,
            "damping": 3,
            "collide": true
          }
        },
        {
          "id": "c90",
          "type": "pin",
          "a": {
            "body": "b86",
            "local": {
              "x": 0.8581151923145204,
              "y": 0.0007512945521411193
            }
          },
          "b": {
            "world": {
              "x": 5.869291881509963,
              "y": 5.148164939702781
            }
          },
          "props": {}
        },
        {
          "id": "c95",
          "type": "spring",
          "a": {
            "body": "b94",
            "local": {
              "x": -0.5956442516638478,
              "y": -0.07463455460339752
            }
          },
          "b": {
            "world": {
              "x": -2.647024280972766,
              "y": 4.6043605077798935
            }
          },
          "props": {
            "stiffness": 80,
            "restLength": 0.6490362588532264,
            "damping": 1,
            "collide": true
          }
        },
        {
          "id": "c96",
          "type": "spring",
          "a": {
            "body": "b94",
            "local": {
              "x": 0.5956442516638478,
              "y": -0.07463455460339752
            }
          },
          "b": {
            "world": {
              "x": -1.4733865842412337,
              "y": 4.39575887022116
            }
          },
          "props": {
            "stiffness": 80,
            "restLength": 0.6457508405334904,
            "damping": 1,
            "collide": true
          }
        },
        {
          "id": "c101",
          "type": "motor",
          "a": {
            "body": "b99",
            "local": {
              "x": 0.002112845145062714,
              "y": -0.013392187688706425
            }
          },
          "b": {
            "world": {
              "x": -3.6912945583365224,
              "y": 2.6925125925988436
            }
          },
          "props": {
            "speed": 2,
            "torque": 4806,
            "reverse": false
          }
        },
        {
          "id": "c102",
          "type": "pin",
          "a": {
            "body": "b100",
            "local": {
              "x": -0.01833299479716133,
              "y": 0.018072952317769175
            }
          },
          "b": {
            "world": {
              "x": -0.39782405152236433,
              "y": 2.032687306450655
            }
          },
          "props": {}
        },
        {
          "id": "c128",
          "type": "pin",
          "a": {
            "body": "b127",
            "local": {
              "x": 0.2250076949919622,
              "y": -0.0012315765156707056
            }
          },
          "b": {
            "body": "b103",
            "local": {
              "x": -0.22522051026149922,
              "y": -0.021568985345158716
            }
          },
          "props": {}
        },
        {
          "id": "c129",
          "type": "pin",
          "a": {
            "body": "b127",
            "local": {
              "x": -0.2252225408716229,
              "y": 0.006057684612513388
            }
          },
          "b": {
            "body": "b126",
            "local": {
              "x": 0.22447855656372473,
              "y": -0.02619333871571597
            }
          },
          "props": {}
        },
        {
          "id": "c130",
          "type": "pin",
          "a": {
            "body": "b126",
            "local": {
              "x": -0.21960386862536602,
              "y": -0.005455310737175131
            }
          },
          "b": {
            "body": "b125",
            "local": {
              "x": 0.23019721356779738,
              "y": 0.016005143062738023
            }
          },
          "props": {}
        },
        {
          "id": "c131",
          "type": "pin",
          "a": {
            "body": "b125",
            "local": {
              "x": -0.20042030743353395,
              "y": -0.021976052964487763
            }
          },
          "b": {
            "body": "b124",
            "local": {
              "x": 0.22218382477617732,
              "y": -0.004551568566457609
            }
          },
          "props": {}
        },
        {
          "id": "c132",
          "type": "pin",
          "a": {
            "body": "b124",
            "local": {
              "x": -0.22532359611753586,
              "y": -0.009354497784210845
            }
          },
          "b": {
            "body": "b123",
            "local": {
              "x": 0.21723531266380372,
              "y": -0.009724021622272754
            }
          },
          "props": {}
        },
        {
          "id": "c133",
          "type": "pin",
          "a": {
            "body": "b123",
            "local": {
              "x": -0.18450354831744653,
              "y": -0.003551238101482182
            }
          },
          "b": {
            "body": "b122",
            "local": {
              "x": 0.22393361402526046,
              "y": 0.0014754198379025307
            }
          },
          "props": {}
        },
        {
          "id": "c134",
          "type": "pin",
          "a": {
            "body": "b122",
            "local": {
              "x": -0.20705519088976823,
              "y": -0.008196990738910274
            }
          },
          "b": {
            "body": "b121",
            "local": {
              "x": 0.22312916993962523,
              "y": 0.005356612389999071
            }
          },
          "props": {}
        },
        {
          "id": "c135",
          "type": "pin",
          "a": {
            "body": "b121",
            "local": {
              "x": -0.2149940993207802,
              "y": -0.01199385922285258
            }
          },
          "b": {
            "body": "b120",
            "local": {
              "x": 0.22128408632543445,
              "y": -0.015114567428955152
            }
          },
          "props": {}
        },
        {
          "id": "c136",
          "type": "pin",
          "a": {
            "body": "b120",
            "local": {
              "x": -0.21723251942652216,
              "y": 0.01540932110944089
            }
          },
          "b": {
            "body": "b119",
            "local": {
              "x": 0.22393660399842108,
              "y": 0.017060683675892106
            }
          },
          "props": {}
        },
        {
          "id": "c137",
          "type": "pin",
          "a": {
            "body": "b119",
            "local": {
              "x": -0.2046370718897876,
              "y": 0.009907025543051742
            }
          },
          "b": {
            "body": "b118",
            "local": {
              "x": 0.21560187446603565,
              "y": 0.002556285477710314
            }
          },
          "props": {}
        },
        {
          "id": "c138",
          "type": "pin",
          "a": {
            "body": "b118",
            "local": {
              "x": -0.20690137035802458,
              "y": -0.006125112515594347
            }
          },
          "b": {
            "body": "b117",
            "local": {
              "x": 0.2188650365922385,
              "y": -0.0020709199523182564
            }
          },
          "props": {}
        },
        {
          "id": "c139",
          "type": "pin",
          "a": {
            "body": "b117",
            "local": {
              "x": -0.20796040341598085,
              "y": -0.01919365151468337
            }
          },
          "b": {
            "body": "b116",
            "local": {
              "x": 0.22540303826543512,
              "y": -0.008702724333950071
            }
          },
          "props": {}
        },
        {
          "id": "c140",
          "type": "pin",
          "a": {
            "body": "b116",
            "local": {
              "x": -0.21829959457153805,
              "y": -0.0148033247107026
            }
          },
          "b": {
            "body": "b115",
            "local": {
              "x": 0.21442758833885442,
              "y": -0.015865030807904835
            }
          },
          "props": {}
        },
        {
          "id": "c141",
          "type": "pin",
          "a": {
            "body": "b115",
            "local": {
              "x": -0.20380402173381756,
              "y": 0.0058077042221698835
            }
          },
          "b": {
            "body": "b114",
            "local": {
              "x": 0.2193441242150115,
              "y": -0.0009681339541102868
            }
          },
          "props": {}
        },
        {
          "id": "c142",
          "type": "pin",
          "a": {
            "body": "b114",
            "local": {
              "x": -0.21338152339919314,
              "y": -0.004612853971955627
            }
          },
          "b": {
            "body": "b113",
            "local": {
              "x": 0.2174467926853152,
              "y": -0.0030824701102056262
            }
          },
          "props": {}
        },
        {
          "id": "c143",
          "type": "pin",
          "a": {
            "body": "b113",
            "local": {
              "x": -0.20825957269751313,
              "y": 0.006043135864976762
            }
          },
          "b": {
            "body": "b112",
            "local": {
              "x": 0.20192540640285123,
              "y": 0.008739354865765579
            }
          },
          "props": {}
        },
        {
          "id": "c144",
          "type": "pin",
          "a": {
            "body": "b111",
            "local": {
              "x": -0.2217957130644989,
              "y": 0.010651024136679836
            }
          },
          "b": {
            "body": "b110",
            "local": {
              "x": 0.21279115233859644,
              "y": 0.009126183023214492
            }
          },
          "props": {}
        },
        {
          "id": "c145",
          "type": "pin",
          "a": {
            "body": "b112",
            "local": {
              "x": -0.20958266431705413,
              "y": 0.009673246452176057
            }
          },
          "b": {
            "body": "b111",
            "local": {
              "x": 0.2169367908963138,
              "y": 0.013379368620677602
            }
          },
          "props": {}
        },
        {
          "id": "c146",
          "type": "pin",
          "a": {
            "body": "b110",
            "local": {
              "x": -0.19882670170372702,
              "y": 0.01924105235760712
            }
          },
          "b": {
            "body": "b109",
            "local": {
              "x": 0.20995861337226882,
              "y": 0.006067758989681905
            }
          },
          "props": {}
        },
        {
          "id": "c147",
          "type": "pin",
          "a": {
            "body": "b109",
            "local": {
              "x": -0.2171972895953357,
              "y": -0.0006207884548152659
            }
          },
          "b": {
            "body": "b108",
            "local": {
              "x": 0.20897808392405337,
              "y": -0.010987004107356348
            }
          },
          "props": {}
        },
        {
          "id": "c148",
          "type": "pin",
          "a": {
            "body": "b104",
            "local": {
              "x": -0.2347685116499849,
              "y": -0.004805289069203855
            }
          },
          "b": {
            "body": "b103",
            "local": {
              "x": 0.22632717871458763,
              "y": -0.018431761599197894
            }
          },
          "props": {}
        },
        {
          "id": "c149",
          "type": "pin",
          "a": {
            "body": "b106",
            "local": {
              "x": -0.23946496268365478,
              "y": -0.00875830453927753
            }
          },
          "b": {
            "body": "b104",
            "local": {
              "x": 0.20127671373131895,
              "y": -0.003503698184958992
            }
          },
          "props": {}
        },
        {
          "id": "c150",
          "type": "pin",
          "a": {
            "body": "b108",
            "local": {
              "x": -0.22328350390960766,
              "y": 0.008872819037922829
            }
          },
          "b": {
            "body": "b106",
            "local": {
              "x": 0.2210757290441712,
              "y": 0.011618434524740467
            }
          },
          "props": {}
        },
        {
          "id": "c152",
          "type": "weld",
          "a": {
            "body": "b151",
            "local": {
              "x": 0.18523522832144057,
              "y": 0.0056803035494861105
            }
          },
          "b": {
            "body": "b113",
            "local": {
              "x": 0.010453656501046913,
              "y": 0.02923029605076426
            }
          },
          "props": {}
        },
        {
          "id": "c154",
          "type": "weld",
          "a": {
            "body": "b153",
            "local": {
              "x": -0.21417638626954666,
              "y": -0.013308529160313184
            }
          },
          "b": {
            "body": "b118",
            "local": {
              "x": 0.02834166298688956,
              "y": -0.004793169137595467
            }
          },
          "props": {}
        },
        {
          "id": "c156",
          "type": "weld",
          "a": {
            "body": "b155",
            "local": {
              "x": -0.20432015463177353,
              "y": 0.005819988787647518
            }
          },
          "b": {
            "body": "b121",
            "local": {
              "x": 0.005507352660038725,
              "y": 0.010291652614280453
            }
          },
          "props": {}
        },
        {
          "id": "c173",
          "type": "weld",
          "a": {
            "body": "b172",
            "local": {
              "x": 0.20635290680656165,
              "y": -0.01498678122353498
            }
          },
          "b": {
            "body": "b103",
            "local": {
              "x": 0.008430295557399343,
              "y": 0.012684613562529192
            }
          },
          "props": {}
        },
        {
          "id": "c174",
          "type": "weld",
          "a": {
            "body": "b170",
            "local": {
              "x": 0.21465590386525202,
              "y": -0.0007104108859726718
            }
          },
          "b": {
            "body": "b109",
            "local": {
              "x": 0.009719683654324462,
              "y": 0.014269447484470968
            }
          },
          "props": {}
        },
        {
          "id": "c175",
          "type": "weld",
          "a": {
            "body": "b171",
            "local": {
              "x": -0.216500021536956,
              "y": -0.013731969524186781
            }
          },
          "b": {
            "body": "b124",
            "local": {
              "x": -0.029810378461210728,
              "y": 0.011626909473985512
            }
          },
          "props": {}
        },
        {
          "id": "c189",
          "type": "weld",
          "a": {
            "body": "b188",
            "local": {
              "x": 0.2579312950340176,
              "y": -0.00948142042904366
            }
          },
          "b": {
            "body": "b187",
            "local": {
              "x": -0.2673738474916815,
              "y": -0.01464851357095917
            }
          },
          "props": {}
        },
        {
          "id": "c192",
          "type": "weld",
          "a": {
            "body": "b191",
            "local": {
              "x": 0.269781437561493,
              "y": -0.004269173197375992
            }
          },
          "b": {
            "body": "b190",
            "local": {
              "x": 0.27627950443712207,
              "y": -0.00023922976900591706
            }
          },
          "props": {}
        },
        {
          "id": "c193",
          "type": "pin",
          "a": {
            "body": "b188",
            "local": {
              "x": -0.2598036276260389,
              "y": 0.004684982836567297
            }
          },
          "b": {
            "world": {
              "x": 2.8578324839377833,
              "y": 3.9042793140862595
            }
          },
          "props": {}
        },
        {
          "id": "c194",
          "type": "pin",
          "a": {
            "body": "b190",
            "local": {
              "x": -0.2657431276079625,
              "y": 0.014327002902674479
            }
          },
          "b": {
            "world": {
              "x": 4.15038514541669,
              "y": 3.8916981407031126
            }
          },
          "props": {}
        },
        {
          "id": "c195",
          "type": "spring",
          "a": {
            "body": "b187",
            "local": {
              "x": 0.2547912829481233,
              "y": -0.005113955049241101
            }
          },
          "b": {
            "body": "b191",
            "local": {
              "x": -0.25518769016942067,
              "y": -0.0077658233445198205
            }
          },
          "props": {
            "stiffness": 3,
            "restLength": 0.1,
            "damping": 2,
            "collide": true
          }
        },
        {
          "id": "c209",
          "type": "pin",
          "a": {
            "body": "b208",
            "local": {
              "x": -0.6006219145503421,
              "y": 0.0014792819669020574
            }
          },
          "b": {
            "body": "b98",
            "local": {
              "x": -0.8885080503968431,
              "y": -0.00453993242794584
            }
          },
          "props": {}
        },
        {
          "id": "c219",
          "type": "motor",
          "a": {
            "body": "b205",
            "local": {
              "x": -0.016167524579725284,
              "y": 0.08618832620062467
            }
          },
          "b": {
            "world": {
              "x": 0.16558465898815483,
              "y": 4.869817825964943
            }
          },
          "props": {
            "speed": 4,
            "torque": 10000,
            "reverse": false
          }
        },
        {
          "id": "c221",
          "type": "weld",
          "a": {
            "body": "b210",
            "local": {
              "x": 0.3803963098254665,
              "y": -0.0064460997803800985
            }
          },
          "b": {
            "body": "b207",
            "local": {
              "x": 0.019008673285615174,
              "y": 0.08164261784881877
            }
          },
          "props": {}
        },
        {
          "id": "c224",
          "type": "pin",
          "a": {
            "body": "b223",
            "local": {
              "x": -0.47053068342459037,
              "y": 0.0044414957322183035
            }
          },
          "b": {
            "world": {
              "x": 2.6555738200974517,
              "y": 2.081924812957124
            }
          },
          "props": {}
        },
        {
          "id": "c225",
          "type": "spring",
          "a": {
            "body": "b223",
            "local": {
              "x": 0.4492790017468131,
              "y": -0.0010333347443354235
            }
          },
          "b": {
            "world": {
              "x": 3.4373626850135173,
              "y": 1.5876687172484103
            }
          },
          "props": {
            "stiffness": 20,
            "restLength": 0.5078945481750199,
            "damping": 3,
            "collide": true
          }
        },
        {
          "id": "c231",
          "type": "pin",
          "a": {
            "body": "b227",
            "local": {
              "x": 0.9114135435650819,
              "y": -0.004123605254288176
            }
          },
          "b": {
            "world": {
              "x": 5.803720679557214,
              "y": 1.7657899818296205
            }
          },
          "props": {}
        },
        {
          "id": "c232",
          "type": "spring",
          "a": {
            "body": "b226",
            "local": {
              "x": 0.4414192713971784,
              "y": -0.0826498207568679
            }
          },
          "b": {
            "body": "b228",
            "local": {
              "x": -0.2696063616358817,
              "y": 0.02831197493854809
            }
          },
          "props": {
            "stiffness": 93,
            "restLength": 1.6,
            "damping": 3,
            "collide": true
          }
        },
        {
          "id": "c233",
          "type": "motor",
          "a": {
            "body": "b228",
            "local": {
              "x": 0.18581174991943605,
              "y": -0.031209175193307015
            }
          },
          "b": {
            "world": {
              "x": 5.756847979954038,
              "y": 3.6898586569548226
            }
          },
          "props": {
            "speed": 2,
            "torque": 10000,
            "reverse": true
          }
        },
        {
          "id": "c234",
          "type": "weld",
          "a": {
            "body": "b227",
            "local": {
              "x": -0.9334202414063385,
              "y": -0.02803164028397226
            }
          },
          "b": {
            "body": "b226",
            "local": {
              "x": 0.31479066272387224,
              "y": 0.009952881104147455
            }
          },
          "props": {}
        },
        {
          "id": "c260",
          "type": "weld",
          "a": {
            "body": "b259",
            "local": {
              "x": -0.2827179101580582,
              "y": -0.04153584306988371
            }
          },
          "b": {
            "body": "b258",
            "local": {
              "x": -0.27942346454717415,
              "y": -0.022672624590897805
            }
          },
          "props": {}
        },
        {
          "id": "c261",
          "type": "weld",
          "a": {
            "body": "b258",
            "local": {
              "x": -0.27942346454717415,
              "y": -0.022672624590897805
            }
          },
          "b": {
            "body": "b257",
            "local": {
              "x": -0.21035095920034974,
              "y": 0.033707939627369496
            }
          },
          "props": {}
        },
        {
          "id": "c262",
          "type": "weld",
          "a": {
            "body": "b257",
            "local": {
              "x": -0.21035095920034974,
              "y": 0.033707939627369496
            }
          },
          "b": {
            "body": "b208",
            "local": {
              "x": 0.5580733222054021,
              "y": -0.03186833416236645
            }
          },
          "props": {}
        },
        {
          "id": "c263",
          "type": "weld",
          "a": {
            "body": "b256",
            "local": {
              "x": -0.205609371309181,
              "y": 0.020872984111176156
            }
          },
          "b": {
            "body": "b208",
            "local": {
              "x": 0.3405873399868441,
              "y": -0.012290380918079435
            }
          },
          "props": {}
        },
        {
          "id": "c270",
          "type": "spring",
          "a": {
            "body": "b268",
            "local": {
              "x": 0.5455083681284056,
              "y": 0.05
            }
          },
          "b": {
            "world": {
              "x": -5.961651691364653,
              "y": 5.701292319667348
            }
          },
          "props": {
            "stiffness": 244,
            "restLength": 0.8376209423367272,
            "damping": 1,
            "collide": true
          }
        },
        {
          "id": "c276",
          "type": "pin",
          "a": {
            "body": "b268",
            "local": {
              "x": -0.7504883889281501,
              "y": 0.010273676435123561
            }
          },
          "b": {
            "world": {
              "x": -5.3382667029828585,
              "y": 6.9834083846577295
            }
          },
          "props": {}
        },
        {
          "id": "c278",
          "type": "spring",
          "a": {
            "body": "b275",
            "local": {
              "x": -0.6409168363320283,
              "y": -0.06468278543903537
            }
          },
          "b": {
            "world": {
              "x": -2.7664740856351453,
              "y": 4.173366911344071
            }
          },
          "props": {
            "stiffness": 250,
            "restLength": 0.7000000000000001,
            "damping": 0.25,
            "collide": true
          }
        },
        {
          "id": "c281",
          "type": "pin",
          "a": {
            "body": "b275",
            "local": {
              "x": 0.8109385127180272,
              "y": 0.000011928286447027148
            }
          },
          "b": {
            "world": {
              "x": -3.0338920624957963,
              "y": 5.8039461906618035
            }
          },
          "props": {}
        }
      ]
    }
  ],
  "title": "Tutorial"
};
